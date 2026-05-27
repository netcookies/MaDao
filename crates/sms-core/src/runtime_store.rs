use crate::error::SmsError;
use crate::models::{
    ActivityEntry, LogEntry, OpenAiSmsRegionsCache, ProviderBalanceCacheEntry, ReleaseAction,
    ReusePoolEntry, RuntimeStateStore, StatsSyncStatus, TicketRecord, TicketStatsEvent,
};
use chrono::{DateTime, Utc};
use parking_lot::Mutex;
use rusqlite::{Connection, OptionalExtension, Transaction, params, params_from_iter};
use std::collections::HashMap;
use std::error::Error as StdError;
use std::path::{Path, PathBuf};
use std::sync::Arc;

const RUNTIME_DB_SCHEMA_VERSION: i64 = 2;
const RELEASE_OWNER_KEY: &str = "release_owner";

#[derive(Debug, Clone)]
pub struct RuntimeStore {
    backend: Arc<RuntimeStoreBackend>,
}

#[derive(Debug)]
enum RuntimeStoreBackend {
    Sqlite {
        path: PathBuf,
    },
    InMemory {
        state: Mutex<RuntimeStateStore>,
        release_owner: Mutex<Option<ReleaseOwnerLease>>,
    },
}

struct RuntimeStoreTx<'backend, 'conn> {
    backend: &'backend RuntimeStoreBackend,
    tx: Transaction<'conn>,
}

#[derive(Debug, Default)]
pub struct RuntimeStoreBatch {
    pub upsert_ticket: Option<TicketRecord>,
    pub upsert_tickets: Vec<TicketRecord>,
    pub delete_ticket_ids: Vec<String>,
    pub log_entries: Vec<LogEntry>,
    pub activity_entries: Vec<ActivityEntry>,
    pub stats_events: Vec<TicketStatsEvent>,
    pub mark_stats_events_synced: Vec<(String, DateTime<Utc>)>,
    pub stats_sync_status: Option<StatsSyncStatus>,
    pub reuse_bucket: Option<(String, Vec<ReusePoolEntry>)>,
    pub provider_balance: Option<ProviderBalanceCacheEntry>,
    pub openai_regions: Option<OpenAiSmsRegionsCache>,
    pub clear_logs: bool,
}

impl RuntimeStoreBatch {
    pub fn is_empty(&self) -> bool {
        self.upsert_ticket.is_none()
            && self.upsert_tickets.is_empty()
            && self.delete_ticket_ids.is_empty()
            && self.log_entries.is_empty()
            && self.activity_entries.is_empty()
            && self.stats_events.is_empty()
            && self.mark_stats_events_synced.is_empty()
            && self.stats_sync_status.is_none()
            && self.reuse_bucket.is_none()
            && self.provider_balance.is_none()
            && self.openai_regions.is_none()
            && !self.clear_logs
    }
}

#[derive(Debug, Clone, Copy)]
pub struct RuntimeStoreApplyOptions {
    pub log_limit: usize,
    pub activity_limit: usize,
}

#[derive(Debug, Clone)]
pub struct ReleaseClaim {
    pub ticket_id: String,
    pub action: ReleaseAction,
    pub auto_release_at: Option<DateTime<Utc>>,
    pub retry_deadline_at: Option<DateTime<Utc>>,
    pub retry_count: u32,
}

#[derive(Debug, Clone)]
pub struct ReleaseOwnerLease {
    pub owner_id: String,
    pub expires_at: DateTime<Utc>,
}

pub trait RuntimeStateRepository: Send + Sync {
    fn load_state(&self) -> Result<RuntimeStateStore, SmsError>;
    fn replace_state(&self, state: &RuntimeStateStore) -> Result<(), SmsError>;
    fn apply_batch(
        &self,
        batch: &RuntimeStoreBatch,
        options: RuntimeStoreApplyOptions,
    ) -> Result<(), SmsError>;
}

pub trait ReleaseCoordinationRepository: Send + Sync {
    fn replace_release_owner(&self, lease: Option<&ReleaseOwnerLease>) -> Result<(), SmsError>;
    fn current_release_owner(&self) -> Result<Option<ReleaseOwnerLease>, SmsError>;
    fn claim_pending_releases(&self, now: DateTime<Utc>) -> Result<Vec<ReleaseClaim>, SmsError>;
    fn acquire_release_owner(
        &self,
        lease: &ReleaseOwnerLease,
        now: DateTime<Utc>,
    ) -> Result<bool, SmsError>;
    fn release_release_owner(&self, owner_id: &str) -> Result<(), SmsError>;

    fn pending_release_claims_or_empty(&self, now: DateTime<Utc>) -> Vec<ReleaseClaim> {
        self.claim_pending_releases(now).unwrap_or_default()
    }

    fn try_acquire_release_owner(
        &self,
        owner_id: &str,
        now: DateTime<Utc>,
        lease_seconds: i64,
    ) -> bool {
        self.acquire_release_owner(
            &ReleaseOwnerLease {
                owner_id: owner_id.to_string(),
                expires_at: now + chrono::Duration::seconds(lease_seconds),
            },
            now,
        )
        .unwrap_or(false)
    }

    fn release_release_owner_quietly(&self, owner_id: &str) {
        let _ = self.release_release_owner(owner_id);
    }
}

#[derive(Clone)]
pub struct RuntimeRepositories {
    pub state: Arc<dyn RuntimeStateRepository>,
    pub release_coordination: Arc<dyn ReleaseCoordinationRepository>,
}

impl RuntimeStore {
    pub fn open(path: impl Into<PathBuf>) -> Result<Self, SmsError> {
        let store = Self {
            backend: Arc::new(RuntimeStoreBackend::Sqlite { path: path.into() }),
        };
        let conn = store.connect()?;
        store.initialize(&conn)?;
        Ok(store)
    }

    pub fn in_memory() -> Self {
        Self {
            backend: Arc::new(RuntimeStoreBackend::InMemory {
                state: Mutex::new(RuntimeStateStore::default()),
                release_owner: Mutex::new(None),
            }),
        }
    }

    pub fn repositories(self) -> RuntimeRepositories {
        let store = Arc::new(self);
        RuntimeRepositories {
            state: store.clone(),
            release_coordination: store,
        }
    }

    pub fn path(&self) -> &Path {
        match self.backend.as_ref() {
            RuntimeStoreBackend::Sqlite { path } => path.as_path(),
            RuntimeStoreBackend::InMemory { .. } => Path::new("<memory>"),
        }
    }

    pub fn load_state(&self) -> Result<RuntimeStateStore, SmsError> {
        if let RuntimeStoreBackend::InMemory { state, .. } = self.backend.as_ref() {
            return Ok(state.lock().clone());
        }
        let conn = self.connect()?;
        let tickets = self.load_tickets(&conn)?;
        let logs = self.load_logs(&conn)?;
        let activity = self.load_activity(&conn)?;
        let ticket_stats_events = self.load_ticket_stats_events(&conn)?;
        let provider_balance_cache = self.load_provider_balances(&conn)?;
        let reuse_pool = self.load_reuse_pool(&conn)?;
        let openai_sms_regions_cache = self.load_openai_regions(&conn)?;
        let stats_sync_status = self.load_stats_sync_status(&conn)?;
        Ok(RuntimeStateStore {
            tickets,
            logs,
            activity,
            provider_balance_cache,
            reuse_pool,
            openai_sms_regions_cache,
            ticket_stats_events,
            stats_sync_status,
        })
    }

    pub fn replace_release_owner(&self, lease: Option<&ReleaseOwnerLease>) -> Result<(), SmsError> {
        if let RuntimeStoreBackend::InMemory { release_owner, .. } = self.backend.as_ref() {
            *release_owner.lock() = lease.cloned();
            return Ok(());
        }
        let conn = self.connect()?;
        conn.execute(
            "DELETE FROM release_owner WHERE id = ?1",
            [RELEASE_OWNER_KEY],
        )
        .map_err(|err| SmsError::Io(format!("clear release owner failed: {err}")))?;
        if let Some(lease) = lease {
            conn.execute(
                "INSERT INTO release_owner (id, owner_id, expires_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4)",
                params![
                    RELEASE_OWNER_KEY,
                    lease.owner_id,
                    lease.expires_at.to_rfc3339(),
                    Utc::now().to_rfc3339(),
                ],
            )
            .map_err(|err| SmsError::Io(format!("seed release owner failed: {err}")))?;
        }
        Ok(())
    }

    pub fn current_release_owner(&self) -> Result<Option<ReleaseOwnerLease>, SmsError> {
        if let RuntimeStoreBackend::InMemory { release_owner, .. } = self.backend.as_ref() {
            return Ok(release_owner.lock().clone());
        }
        let conn = self.connect()?;
        conn.query_row(
            "SELECT owner_id, expires_at FROM release_owner WHERE id = ?1",
            [RELEASE_OWNER_KEY],
            |row| {
                let owner_id: String = row.get(0)?;
                let expires_at: String = row.get(1)?;
                Ok((owner_id, expires_at))
            },
        )
        .optional()
        .map_err(|err| SmsError::Io(format!("read release owner failed: {err}")))?
        .map(|(owner_id, expires_at)| {
            parse_datetime(expires_at).map(|expires_at| ReleaseOwnerLease {
                owner_id,
                expires_at,
            })
        })
        .transpose()
    }

    pub fn replace_state(&self, state: &RuntimeStateStore) -> Result<(), SmsError> {
        self.transact(|tx| tx.replace_state(state))
    }

    pub fn apply_batch(
        &self,
        batch: &RuntimeStoreBatch,
        options: RuntimeStoreApplyOptions,
    ) -> Result<(), SmsError> {
        if batch.is_empty() {
            return Ok(());
        }
        self.transact(|tx| tx.apply_batch(batch, options))
    }

    fn transact<T>(
        &self,
        op: impl FnOnce(&mut RuntimeStoreTx<'_, '_>) -> Result<T, SmsError>,
    ) -> Result<T, SmsError> {
        if let RuntimeStoreBackend::InMemory { .. } = self.backend.as_ref() {
            let mut conn = self.connect()?;
            let tx = conn
                .transaction()
                .map_err(|err| SmsError::Io(format!("begin in-memory tx failed: {err}")))?;
            let mut runtime_tx = RuntimeStoreTx {
                backend: self.backend.as_ref(),
                tx,
            };
            return op(&mut runtime_tx);
        }
        let mut conn = self.connect()?;
        let tx = conn
            .transaction()
            .map_err(|err| SmsError::Io(format!("begin sqlite tx failed: {err}")))?;
        let mut runtime_tx = RuntimeStoreTx {
            backend: self.backend.as_ref(),
            tx,
        };
        let result = op(&mut runtime_tx)?;
        runtime_tx
            .tx
            .commit()
            .map_err(|err| SmsError::Io(format!("commit sqlite tx failed: {err}")))?;
        Ok(result)
    }

    pub fn claim_pending_releases(
        &self,
        now: DateTime<Utc>,
    ) -> Result<Vec<ReleaseClaim>, SmsError> {
        if let RuntimeStoreBackend::InMemory { state, .. } = self.backend.as_ref() {
            return Ok(state
                .lock()
                .tickets
                .iter()
                .filter(|ticket| {
                    ticket.status == crate::models::TicketStatus::CancelPending
                        && ticket.pending_release_action.is_some()
                        && ticket
                            .next_release_attempt_at
                            .is_some_and(|time| time <= now)
                })
                .map(|ticket| ReleaseClaim {
                    ticket_id: ticket.id.clone(),
                    action: ticket
                        .pending_release_action
                        .clone()
                        .unwrap_or(ReleaseAction::Cancel),
                    auto_release_at: ticket.auto_release_at,
                    retry_deadline_at: ticket.release_retry_deadline_at,
                    retry_count: ticket.release_retry_count,
                })
                .collect());
        }
        let conn = self.connect()?;
        let mut stmt = conn
            .prepare(
                "SELECT id,
                        pending_release_action,
                        auto_release_at,
                        release_retry_deadline_at,
                        release_retry_count
                 FROM tickets
                 WHERE status = 'cancel_pending'
                   AND pending_release_action IS NOT NULL
                   AND next_release_attempt_at IS NOT NULL
                   AND next_release_attempt_at <= ?1
                 ORDER BY next_release_attempt_at ASC, updated_at ASC",
            )
            .map_err(|err| SmsError::Io(format!("prepare release claim query failed: {err}")))?;
        let rows = stmt
            .query_map([now.to_rfc3339()], |row| {
                let action = row.get::<_, String>(1)?;
                Ok(ReleaseClaim {
                    ticket_id: row.get(0)?,
                    action: decode_release_action(&action),
                    auto_release_at: parse_optional_datetime(row.get::<_, Option<String>>(2)?),
                    retry_deadline_at: parse_optional_datetime(row.get::<_, Option<String>>(3)?),
                    retry_count: row.get::<_, u32>(4)?,
                })
            })
            .map_err(|err| SmsError::Io(format!("query release claims failed: {err}")))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|err| SmsError::Io(format!("decode release claims failed: {err}")))
    }

    pub fn pending_release_claims_or_empty(&self, now: DateTime<Utc>) -> Vec<ReleaseClaim> {
        self.claim_pending_releases(now).unwrap_or_default()
    }

    pub fn acquire_release_owner(
        &self,
        lease: &ReleaseOwnerLease,
        now: DateTime<Utc>,
    ) -> Result<bool, SmsError> {
        if let RuntimeStoreBackend::InMemory { release_owner, .. } = self.backend.as_ref() {
            let mut current = release_owner.lock();
            let allowed = current
                .as_ref()
                .is_none_or(|owner| owner.expires_at <= now || owner.owner_id == lease.owner_id);
            if allowed {
                *current = Some(lease.clone());
            }
            return Ok(allowed);
        }
        let conn = self.connect()?;
        let updated = conn
            .execute(
                "INSERT INTO release_owner (id, owner_id, expires_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(id) DO UPDATE SET
                   owner_id = excluded.owner_id,
                   expires_at = excluded.expires_at,
                   updated_at = excluded.updated_at
                 WHERE release_owner.expires_at <= ?5
                    OR release_owner.owner_id = excluded.owner_id",
                params![
                    RELEASE_OWNER_KEY,
                    lease.owner_id,
                    lease.expires_at.to_rfc3339(),
                    now.to_rfc3339(),
                    now.to_rfc3339(),
                ],
            )
            .map_err(|err| SmsError::Io(format!("acquire release owner failed: {err}")))?;
        Ok(updated > 0)
    }

    pub fn try_acquire_release_owner(
        &self,
        owner_id: &str,
        now: DateTime<Utc>,
        lease_seconds: i64,
    ) -> bool {
        self.acquire_release_owner(
            &ReleaseOwnerLease {
                owner_id: owner_id.to_string(),
                expires_at: now + chrono::Duration::seconds(lease_seconds),
            },
            now,
        )
        .unwrap_or(false)
    }

    pub fn release_release_owner(&self, owner_id: &str) -> Result<(), SmsError> {
        if let RuntimeStoreBackend::InMemory { release_owner, .. } = self.backend.as_ref() {
            let mut current = release_owner.lock();
            if current
                .as_ref()
                .is_some_and(|lease| lease.owner_id == owner_id)
            {
                *current = None;
            }
            return Ok(());
        }
        let conn = self.connect()?;
        conn.execute(
            "DELETE FROM release_owner WHERE id = ?1 AND owner_id = ?2",
            params![RELEASE_OWNER_KEY, owner_id],
        )
        .map_err(|err| SmsError::Io(format!("release release owner failed: {err}")))?;
        Ok(())
    }

    pub fn release_release_owner_quietly(&self, owner_id: &str) {
        let _ = self.release_release_owner(owner_id);
    }

    fn connect(&self) -> Result<Connection, SmsError> {
        let RuntimeStoreBackend::Sqlite { path } = self.backend.as_ref() else {
            let conn = Connection::open_in_memory()
                .map_err(|err| SmsError::Io(format!("open in-memory sqlite failed: {err}")))?;
            conn.execute_batch("PRAGMA foreign_keys=ON;")
                .map_err(|err| {
                    SmsError::Io(format!("configure in-memory runtime store failed: {err}"))
                })?;
            return Ok(conn);
        };
        let conn = Connection::open(path)
            .map_err(|err| SmsError::Io(format!("open sqlite runtime store failed: {err}")))?;
        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA foreign_keys=ON;
             PRAGMA synchronous=NORMAL;
             PRAGMA busy_timeout=5000;",
        )
        .map_err(|err| SmsError::Io(format!("configure sqlite runtime store failed: {err}")))?;
        Ok(conn)
    }

    fn initialize(&self, conn: &Connection) -> Result<(), SmsError> {
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS runtime_meta (
              key TEXT PRIMARY KEY,
              value_json TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS tickets (
              id TEXT PRIMARY KEY,
              payload_json TEXT NOT NULL,
              status TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              next_release_attempt_at TEXT,
              pending_release_action TEXT
            );
            CREATE TABLE IF NOT EXISTS logs (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              timestamp TEXT NOT NULL,
              scope TEXT NOT NULL,
              level TEXT NOT NULL,
              message TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS activity (
              id TEXT PRIMARY KEY,
              timestamp TEXT NOT NULL,
              level TEXT NOT NULL,
              kind TEXT NOT NULL,
              payload_json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS ticket_stats_events (
              id TEXT PRIMARY KEY,
              ticket_id TEXT NOT NULL,
              provider TEXT NOT NULL,
              service TEXT NOT NULL,
              country TEXT NOT NULL,
              operator TEXT,
              outcome TEXT NOT NULL,
              status TEXT NOT NULL,
              occurred_at TEXT NOT NULL,
              routing_plan_id TEXT,
              routing_item_id TEXT,
              message TEXT,
              synced_at TEXT
            );
            CREATE TABLE IF NOT EXISTS provider_balance_cache (
              provider TEXT PRIMARY KEY,
              payload_json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS reuse_pool (
              row_id INTEGER PRIMARY KEY AUTOINCREMENT,
              provider_bucket TEXT NOT NULL,
              phone_number TEXT NOT NULL,
              service TEXT NOT NULL,
              country TEXT NOT NULL,
              payload_json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS release_owner (
              id TEXT PRIMARY KEY,
              owner_id TEXT NOT NULL,
              expires_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_tickets_release_ready
              ON tickets(status, next_release_attempt_at);
            CREATE INDEX IF NOT EXISTS idx_logs_timestamp
              ON logs(timestamp DESC);
            CREATE INDEX IF NOT EXISTS idx_activity_timestamp
              ON activity(timestamp DESC);
            CREATE INDEX IF NOT EXISTS idx_ticket_stats_events_occurred_at
              ON ticket_stats_events(occurred_at DESC);
            CREATE INDEX IF NOT EXISTS idx_reuse_pool_bucket
              ON reuse_pool(provider_bucket, service, country);
            ",
        )
        .map_err(|err| SmsError::Io(format!("initialize sqlite schema failed: {err}")))?;
        let current: Option<i64> = conn
            .query_row(
                "SELECT CAST(value_json AS INTEGER) FROM runtime_meta WHERE key = 'schema_version'",
                [],
                |row| row.get(0),
            )
            .optional()
            .map_err(|err| SmsError::Io(format!("read sqlite schema version failed: {err}")))?;
        if current.unwrap_or(0) < RUNTIME_DB_SCHEMA_VERSION {
            self.migrate_schema(conn, current.unwrap_or(0))?;
            conn.execute(
                "INSERT INTO runtime_meta (key, value_json, updated_at)
                 VALUES ('schema_version', ?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET
                   value_json = excluded.value_json,
                   updated_at = excluded.updated_at",
                params![
                    RUNTIME_DB_SCHEMA_VERSION.to_string(),
                    Utc::now().to_rfc3339()
                ],
            )
            .map_err(|err| SmsError::Io(format!("write sqlite schema version failed: {err}")))?;
        }
        Ok(())
    }

    fn migrate_schema(&self, conn: &Connection, current_version: i64) -> Result<(), SmsError> {
        if current_version >= 2 {
            return Ok(());
        }

        conn.execute_batch(
            "
            ALTER TABLE tickets RENAME TO tickets_legacy;
            CREATE TABLE tickets (
              id TEXT PRIMARY KEY,
              provider TEXT NOT NULL,
              service TEXT NOT NULL,
              country TEXT NOT NULL,
              operator TEXT,
              phone_number TEXT NOT NULL,
              upstream_id TEXT,
              price REAL,
              status TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              acquire_path TEXT NOT NULL,
              code TEXT,
              message TEXT,
              same_activation_retry_supported INTEGER NOT NULL,
              same_activation_retry_expires_at TEXT,
              pending_release_action TEXT,
              auto_release_at TEXT,
              next_release_attempt_at TEXT,
              release_retry_deadline_at TEXT,
              release_retry_count INTEGER NOT NULL,
              routing_plan_id TEXT,
              routing_plan_name TEXT,
              routing_item_id TEXT,
              routing_item_index INTEGER,
              routing_execution_mode TEXT,
              routing_execution_rounds INTEGER,
              routing_current_round INTEGER,
              routing_candidate_item_ids_json TEXT NOT NULL,
              routing_attempt_count INTEGER NOT NULL,
              reuse_count INTEGER NOT NULL
            );
            DROP INDEX IF EXISTS idx_tickets_release_ready;
            CREATE INDEX idx_tickets_release_ready
              ON tickets(status, next_release_attempt_at);
            ",
        )
        .map_err(|err| SmsError::Io(format!("migrate tickets schema failed: {err}")))?;

        let mut stmt = conn
            .prepare("SELECT payload_json FROM tickets_legacy ORDER BY updated_at DESC, id DESC")
            .map_err(|err| SmsError::Io(format!("prepare legacy ticket load failed: {err}")))?;
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|err| SmsError::Io(format!("query legacy ticket load failed: {err}")))?;
        let mut tickets = Vec::new();
        for row in rows {
            let payload =
                row.map_err(|err| SmsError::Io(format!("read legacy ticket row failed: {err}")))?;
            let ticket = serde_json::from_str::<TicketRecord>(&payload)
                .map_err(|err| SmsError::Config(format!("parse legacy ticket payload failed: {err}")))?;
            tickets.push(ticket);
        }
        drop(stmt);
        let tx = conn
            .unchecked_transaction()
            .map_err(|err| SmsError::Io(format!("open migration transaction failed: {err}")))?;
        insert_tickets(&tx, &tickets)?;
        tx.commit()
            .map_err(|err| SmsError::Io(format!("commit migrated tickets failed: {err}")))?;
        conn.execute("DROP TABLE tickets_legacy", [])
            .map_err(|err| SmsError::Io(format!("drop legacy tickets table failed: {err}")))?;
        Ok(())
    }

    fn load_tickets(&self, conn: &Connection) -> Result<Vec<TicketRecord>, SmsError> {
        let mut stmt = conn
            .prepare(
                "SELECT id, provider, service, country, operator, phone_number, upstream_id, price,
                        status, created_at, updated_at, acquire_path, code, message,
                        same_activation_retry_supported, same_activation_retry_expires_at,
                        pending_release_action, auto_release_at, next_release_attempt_at,
                        release_retry_deadline_at, release_retry_count,
                        routing_plan_id, routing_plan_name, routing_item_id, routing_item_index,
                        routing_execution_mode, routing_execution_rounds, routing_current_round,
                        routing_candidate_item_ids_json, routing_attempt_count, reuse_count
                 FROM tickets
                 ORDER BY updated_at DESC, id DESC",
            )
            .map_err(|err| SmsError::Io(format!("prepare ticket load failed: {err}")))?;
        let rows = stmt
            .query_map([], |row| decode_ticket_row(row))
            .map_err(|err| SmsError::Io(format!("query ticket load failed: {err}")))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|err| SmsError::Io(format!("decode tickets failed: {err}")))
    }

    fn load_logs(&self, conn: &Connection) -> Result<Vec<LogEntry>, SmsError> {
        let mut stmt = conn
            .prepare(
                "SELECT timestamp, scope, level, message FROM logs ORDER BY timestamp ASC, id ASC",
            )
            .map_err(|err| SmsError::Io(format!("prepare log load failed: {err}")))?;
        let rows = stmt
            .query_map([], |row| {
                Ok(LogEntry {
                    timestamp: parse_datetime(row.get::<_, String>(0)?).map_err(|err| {
                        rusqlite::Error::ToSqlConversionFailure(
                            Box::new(err) as Box<dyn StdError + Send + Sync>
                        )
                    })?,
                    scope: row.get(1)?,
                    level: row.get(2)?,
                    message: row.get(3)?,
                })
            })
            .map_err(|err| SmsError::Io(format!("query log load failed: {err}")))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|err| SmsError::Io(format!("decode logs failed: {err}")))
    }

    fn load_activity(&self, conn: &Connection) -> Result<Vec<ActivityEntry>, SmsError> {
        let mut stmt = conn
            .prepare("SELECT payload_json FROM activity ORDER BY timestamp ASC, id ASC")
            .map_err(|err| SmsError::Io(format!("prepare activity load failed: {err}")))?;
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|err| SmsError::Io(format!("query activity load failed: {err}")))?;
        rows.map(|row| {
            let payload =
                row.map_err(|err| SmsError::Io(format!("read activity row failed: {err}")))?;
            serde_json::from_str::<ActivityEntry>(&payload)
                .map_err(|err| SmsError::Config(format!("parse activity payload failed: {err}")))
        })
        .collect()
    }

    fn load_ticket_stats_events(
        &self,
        conn: &Connection,
    ) -> Result<Vec<TicketStatsEvent>, SmsError> {
        let mut stmt = conn
            .prepare(
                "SELECT id, ticket_id, provider, service, country, operator, outcome, status,
                        occurred_at, routing_plan_id, routing_item_id, message, synced_at
                 FROM ticket_stats_events
                 ORDER BY occurred_at ASC, id ASC",
            )
            .map_err(|err| SmsError::Io(format!("prepare stats event load failed: {err}")))?;
        let rows = stmt
            .query_map([], |row| decode_ticket_stats_event_row(row))
            .map_err(|err| SmsError::Io(format!("query stats event load failed: {err}")))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|err| SmsError::Io(format!("decode stats events failed: {err}")))
    }

    fn load_provider_balances(
        &self,
        conn: &Connection,
    ) -> Result<Vec<ProviderBalanceCacheEntry>, SmsError> {
        let mut stmt = conn
            .prepare("SELECT payload_json FROM provider_balance_cache ORDER BY provider ASC")
            .map_err(|err| SmsError::Io(format!("prepare balance load failed: {err}")))?;
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|err| SmsError::Io(format!("query balance load failed: {err}")))?;
        rows.map(|row| {
            let payload =
                row.map_err(|err| SmsError::Io(format!("read balance row failed: {err}")))?;
            serde_json::from_str::<ProviderBalanceCacheEntry>(&payload)
                .map_err(|err| SmsError::Config(format!("parse balance payload failed: {err}")))
        })
        .collect()
    }

    fn load_reuse_pool(
        &self,
        conn: &Connection,
    ) -> Result<HashMap<String, Vec<ReusePoolEntry>>, SmsError> {
        let mut stmt = conn
            .prepare(
                "SELECT provider_bucket, payload_json
                 FROM reuse_pool
                 ORDER BY provider_bucket ASC, service ASC, country ASC, row_id ASC",
            )
            .map_err(|err| SmsError::Io(format!("prepare reuse pool load failed: {err}")))?;
        let rows = stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|err| SmsError::Io(format!("query reuse pool load failed: {err}")))?;
        let mut reuse_pool = HashMap::new();
        for row in rows {
            let (provider_bucket, payload) =
                row.map_err(|err| SmsError::Io(format!("read reuse pool row failed: {err}")))?;
            let entry = serde_json::from_str::<ReusePoolEntry>(&payload).map_err(|err| {
                SmsError::Config(format!("parse reuse pool payload failed: {err}"))
            })?;
            reuse_pool
                .entry(provider_bucket)
                .or_insert_with(Vec::new)
                .push(entry);
        }
        Ok(reuse_pool)
    }

    fn load_openai_regions(&self, conn: &Connection) -> Result<OpenAiSmsRegionsCache, SmsError> {
        let payload: Option<String> = conn
            .query_row(
                "SELECT value_json FROM runtime_meta WHERE key = 'openai_sms_regions_cache'",
                [],
                |row| row.get(0),
            )
            .optional()
            .map_err(|err| SmsError::Io(format!("read openai regions failed: {err}")))?;
        payload
            .map(|value| {
                serde_json::from_str::<OpenAiSmsRegionsCache>(&value)
                    .map_err(|err| SmsError::Config(format!("parse openai regions failed: {err}")))
            })
            .transpose()
            .map(|value| value.unwrap_or_default())
    }

    fn load_stats_sync_status(&self, conn: &Connection) -> Result<StatsSyncStatus, SmsError> {
        let payload: Option<String> = conn
            .query_row(
                "SELECT value_json FROM runtime_meta WHERE key = 'stats_sync_status'",
                [],
                |row| row.get(0),
            )
            .optional()
            .map_err(|err| SmsError::Io(format!("read stats sync status failed: {err}")))?;
        payload
            .map(|value| {
                serde_json::from_str::<StatsSyncStatus>(&value).map_err(|err| {
                    SmsError::Config(format!("parse stats sync status failed: {err}"))
                })
            })
            .transpose()
            .map(|value| value.unwrap_or_default())
    }
}

impl RuntimeStateRepository for RuntimeStore {
    fn load_state(&self) -> Result<RuntimeStateStore, SmsError> {
        RuntimeStore::load_state(self)
    }

    fn replace_state(&self, state: &RuntimeStateStore) -> Result<(), SmsError> {
        RuntimeStore::replace_state(self, state)
    }

    fn apply_batch(
        &self,
        batch: &RuntimeStoreBatch,
        options: RuntimeStoreApplyOptions,
    ) -> Result<(), SmsError> {
        RuntimeStore::apply_batch(self, batch, options)
    }
}

impl ReleaseCoordinationRepository for RuntimeStore {
    fn replace_release_owner(&self, lease: Option<&ReleaseOwnerLease>) -> Result<(), SmsError> {
        RuntimeStore::replace_release_owner(self, lease)
    }

    fn current_release_owner(&self) -> Result<Option<ReleaseOwnerLease>, SmsError> {
        RuntimeStore::current_release_owner(self)
    }

    fn claim_pending_releases(&self, now: DateTime<Utc>) -> Result<Vec<ReleaseClaim>, SmsError> {
        RuntimeStore::claim_pending_releases(self, now)
    }

    fn acquire_release_owner(
        &self,
        lease: &ReleaseOwnerLease,
        now: DateTime<Utc>,
    ) -> Result<bool, SmsError> {
        RuntimeStore::acquire_release_owner(self, lease, now)
    }

    fn release_release_owner(&self, owner_id: &str) -> Result<(), SmsError> {
        RuntimeStore::release_release_owner(self, owner_id)
    }
}

fn insert_tickets(tx: &Transaction<'_>, tickets: &[TicketRecord]) -> Result<(), SmsError> {
    let mut stmt = tx
            .prepare(
                "INSERT INTO tickets (
                    id, provider, service, country, operator, phone_number, upstream_id, price,
                    status, created_at, updated_at, acquire_path, code, message,
                    same_activation_retry_supported, same_activation_retry_expires_at,
                    pending_release_action, auto_release_at, next_release_attempt_at,
                    release_retry_deadline_at, release_retry_count,
                    routing_plan_id, routing_plan_name, routing_item_id, routing_item_index,
                    routing_execution_mode, routing_execution_rounds, routing_current_round,
                    routing_candidate_item_ids_json, routing_attempt_count, reuse_count
                 ) VALUES (
                    ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16,
                    ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31
                 )",
            )
            .map_err(|err| SmsError::Io(format!("prepare ticket insert failed: {err}")))?;
    for ticket in tickets {
        let candidate_ids = serde_json::to_string(&ticket.routing_candidate_item_ids)
            .map_err(|err| SmsError::Config(format!("serialize ticket candidate ids failed: {err}")))?;
        stmt.execute(params![
            ticket.id,
            ticket.provider,
            ticket.service,
            ticket.country,
            ticket.operator,
            ticket.phone_number,
            ticket.upstream_id,
            ticket.price,
            encode_ticket_status(&ticket.status),
            ticket.created_at.to_rfc3339(),
            ticket.updated_at.to_rfc3339(),
            encode_acquire_path(&ticket.acquire_path),
            ticket.code,
            ticket.message,
            ticket.same_activation_retry_supported as i64,
            ticket.same_activation_retry_expires_at.map(|value| value.to_rfc3339()),
            ticket.pending_release_action.as_ref().map(encode_release_action),
            ticket.auto_release_at.map(|value| value.to_rfc3339()),
            ticket.next_release_attempt_at.map(|value| value.to_rfc3339()),
            ticket.release_retry_deadline_at.map(|value| value.to_rfc3339()),
            ticket.release_retry_count,
            ticket.routing_plan_id,
            ticket.routing_plan_name,
            ticket.routing_item_id,
            ticket.routing_item_index,
            ticket.routing_execution_mode.map(|value| encode_routing_execution_mode(&value)),
            ticket.routing_execution_rounds,
            ticket.routing_current_round,
            candidate_ids,
            ticket.routing_attempt_count,
            ticket.reuse_count,
        ])
        .map_err(|err| SmsError::Io(format!("insert ticket failed: {err}")))?;
    }
    Ok(())
}

fn upsert_ticket_tx(tx: &Transaction<'_>, ticket: &TicketRecord) -> Result<(), SmsError> {
    let candidate_ids = serde_json::to_string(&ticket.routing_candidate_item_ids)
        .map_err(|err| SmsError::Config(format!("serialize ticket candidate ids failed: {err}")))?;
    tx.execute(
            "INSERT INTO tickets (
                id, provider, service, country, operator, phone_number, upstream_id, price,
                status, created_at, updated_at, acquire_path, code, message,
                same_activation_retry_supported, same_activation_retry_expires_at,
                pending_release_action, auto_release_at, next_release_attempt_at,
                release_retry_deadline_at, release_retry_count,
                routing_plan_id, routing_plan_name, routing_item_id, routing_item_index,
                routing_execution_mode, routing_execution_rounds, routing_current_round,
                routing_candidate_item_ids_json, routing_attempt_count, reuse_count
             ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16,
                ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31
             )
             ON CONFLICT(id) DO UPDATE SET
                provider = excluded.provider,
                service = excluded.service,
                country = excluded.country,
                operator = excluded.operator,
                phone_number = excluded.phone_number,
                upstream_id = excluded.upstream_id,
                price = excluded.price,
                status = excluded.status,
                created_at = excluded.created_at,
                updated_at = excluded.updated_at,
                acquire_path = excluded.acquire_path,
                code = excluded.code,
                message = excluded.message,
                same_activation_retry_supported = excluded.same_activation_retry_supported,
                same_activation_retry_expires_at = excluded.same_activation_retry_expires_at,
                pending_release_action = excluded.pending_release_action,
                auto_release_at = excluded.auto_release_at,
                next_release_attempt_at = excluded.next_release_attempt_at,
                release_retry_deadline_at = excluded.release_retry_deadline_at,
                release_retry_count = excluded.release_retry_count,
                routing_plan_id = excluded.routing_plan_id,
                routing_plan_name = excluded.routing_plan_name,
                routing_item_id = excluded.routing_item_id,
                routing_item_index = excluded.routing_item_index,
                routing_execution_mode = excluded.routing_execution_mode,
                routing_execution_rounds = excluded.routing_execution_rounds,
                routing_current_round = excluded.routing_current_round,
                routing_candidate_item_ids_json = excluded.routing_candidate_item_ids_json,
                routing_attempt_count = excluded.routing_attempt_count,
                reuse_count = excluded.reuse_count",
            params![
                ticket.id,
                ticket.provider,
                ticket.service,
                ticket.country,
                ticket.operator,
                ticket.phone_number,
                ticket.upstream_id,
                ticket.price,
                encode_ticket_status(&ticket.status),
                ticket.created_at.to_rfc3339(),
                ticket.updated_at.to_rfc3339(),
                encode_acquire_path(&ticket.acquire_path),
                ticket.code,
                ticket.message,
                ticket.same_activation_retry_supported as i64,
                ticket.same_activation_retry_expires_at.map(|value| value.to_rfc3339()),
                ticket.pending_release_action.as_ref().map(encode_release_action),
                ticket.auto_release_at.map(|value| value.to_rfc3339()),
                ticket.next_release_attempt_at.map(|value| value.to_rfc3339()),
                ticket.release_retry_deadline_at.map(|value| value.to_rfc3339()),
                ticket.release_retry_count,
                ticket.routing_plan_id,
                ticket.routing_plan_name,
                ticket.routing_item_id,
                ticket.routing_item_index,
                ticket.routing_execution_mode.map(|value| encode_routing_execution_mode(&value)),
                ticket.routing_execution_rounds,
                ticket.routing_current_round,
                candidate_ids,
                ticket.routing_attempt_count,
                ticket.reuse_count,
            ],
        )
        .map_err(|err| SmsError::Io(format!("upsert ticket failed: {err}")))?;
    Ok(())
}

fn decode_ticket_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<TicketRecord> {
    let created_at = parse_datetime(row.get::<_, String>(9)?).map_err(to_sqlite_decode_error)?;
    let updated_at = parse_datetime(row.get::<_, String>(10)?).map_err(to_sqlite_decode_error)?;
    let same_activation_retry_expires_at =
        parse_optional_datetime(row.get::<_, Option<String>>(15)?);
    let auto_release_at = parse_optional_datetime(row.get::<_, Option<String>>(17)?);
    let next_release_attempt_at = parse_optional_datetime(row.get::<_, Option<String>>(18)?);
    let release_retry_deadline_at = parse_optional_datetime(row.get::<_, Option<String>>(19)?);
    let routing_candidate_item_ids_json = row.get::<_, String>(28)?;
    let routing_candidate_item_ids = serde_json::from_str::<Vec<String>>(
        &routing_candidate_item_ids_json,
    )
    .map_err(|err| {
        rusqlite::Error::ToSqlConversionFailure(
            Box::new(err) as Box<dyn StdError + Send + Sync>
        )
    })?;

    Ok(TicketRecord {
        id: row.get(0)?,
        provider: row.get(1)?,
        service: row.get(2)?,
        country: row.get(3)?,
        operator: row.get(4)?,
        phone_number: row.get(5)?,
        upstream_id: row.get(6)?,
        price: row.get(7)?,
        status: decode_ticket_status(&row.get::<_, String>(8)?),
        created_at,
        updated_at,
        acquire_path: decode_acquire_path(&row.get::<_, String>(11)?),
        code: row.get(12)?,
        message: row.get(13)?,
        same_activation_retry_supported: row.get::<_, i64>(14)? != 0,
        same_activation_retry_expires_at,
        pending_release_action: row
            .get::<_, Option<String>>(16)?
            .map(|value| decode_release_action(&value)),
        auto_release_at,
        next_release_attempt_at,
        release_retry_deadline_at,
        release_retry_count: row.get(20)?,
        routing_plan_id: row.get(21)?,
        routing_plan_name: row.get(22)?,
        routing_item_id: row.get(23)?,
        routing_item_index: row.get(24)?,
        routing_execution_mode: row
            .get::<_, Option<String>>(25)?
            .map(|value| decode_routing_execution_mode(&value)),
        routing_execution_rounds: row.get(26)?,
        routing_current_round: row.get(27)?,
        routing_candidate_item_ids,
        routing_attempt_count: row.get(29)?,
        reuse_count: row.get(30)?,
    })
}

fn decode_ticket_stats_event_row(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<TicketStatsEvent> {
    let occurred_at = parse_datetime(row.get::<_, String>(8)?).map_err(to_sqlite_decode_error)?;
    let synced_at = parse_optional_datetime(row.get::<_, Option<String>>(12)?);
    Ok(TicketStatsEvent {
        id: row.get(0)?,
        ticket_id: row.get(1)?,
        provider: row.get(2)?,
        service: row.get(3)?,
        country: row.get(4)?,
        operator: row.get(5)?,
        outcome: decode_ticket_stats_outcome(&row.get::<_, String>(6)?),
        status: decode_ticket_status(&row.get::<_, String>(7)?),
        occurred_at,
        routing_plan_id: row.get(9)?,
        routing_item_id: row.get(10)?,
        message: row.get(11)?,
        synced_at,
    })
}

fn to_sqlite_decode_error(err: SmsError) -> rusqlite::Error {
    rusqlite::Error::ToSqlConversionFailure(Box::new(err) as Box<dyn StdError + Send + Sync>)
}

fn insert_logs(tx: &Transaction<'_>, logs: &[LogEntry]) -> Result<(), SmsError> {
    let mut stmt = tx
        .prepare("INSERT INTO logs (timestamp, scope, level, message) VALUES (?1, ?2, ?3, ?4)")
        .map_err(|err| SmsError::Io(format!("prepare log insert failed: {err}")))?;
    for entry in logs {
        stmt.execute(params![
            entry.timestamp.to_rfc3339(),
            entry.scope,
            entry.level,
            entry.message,
        ])
        .map_err(|err| SmsError::Io(format!("insert log failed: {err}")))?;
    }
    Ok(())
}

fn insert_activity(tx: &Transaction<'_>, activity: &[ActivityEntry]) -> Result<(), SmsError> {
    let mut stmt = tx
        .prepare(
            "INSERT INTO activity (id, timestamp, level, kind, payload_json)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
        )
        .map_err(|err| SmsError::Io(format!("prepare activity insert failed: {err}")))?;
    for entry in activity {
        let payload = serde_json::to_string(entry)
            .map_err(|err| SmsError::Config(format!("serialize activity failed: {err}")))?;
        stmt.execute(params![
            entry.id,
            entry.timestamp.to_rfc3339(),
            encode_activity_level(&entry.level),
            encode_activity_kind(&entry.kind),
            payload,
        ])
        .map_err(|err| SmsError::Io(format!("insert activity failed: {err}")))?;
    }
    Ok(())
}

fn insert_ticket_stats_events(
    tx: &Transaction<'_>,
    events: &[TicketStatsEvent],
) -> Result<(), SmsError> {
    let mut stmt = tx
        .prepare(
            "INSERT INTO ticket_stats_events (
                id, ticket_id, provider, service, country, operator, outcome, status,
                occurred_at, routing_plan_id, routing_item_id, message, synced_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        )
        .map_err(|err| SmsError::Io(format!("prepare stats event insert failed: {err}")))?;
    for event in events {
        stmt.execute(params![
            event.id,
            event.ticket_id,
            event.provider,
            event.service,
            event.country,
            event.operator,
            encode_ticket_stats_outcome(&event.outcome),
            encode_ticket_status(&event.status),
            event.occurred_at.to_rfc3339(),
            event.routing_plan_id,
            event.routing_item_id,
            event.message,
            event.synced_at.map(|value| value.to_rfc3339()),
        ])
        .map_err(|err| SmsError::Io(format!("insert stats event failed: {err}")))?;
    }
    Ok(())
}

fn insert_provider_balances(
    tx: &Transaction<'_>,
    balances: &[ProviderBalanceCacheEntry],
) -> Result<(), SmsError> {
    let mut stmt = tx
        .prepare("INSERT INTO provider_balance_cache (provider, payload_json) VALUES (?1, ?2)")
        .map_err(|err| SmsError::Io(format!("prepare balance insert failed: {err}")))?;
    for entry in balances {
        let payload = serde_json::to_string(entry)
            .map_err(|err| SmsError::Config(format!("serialize balance failed: {err}")))?;
        stmt.execute(params![entry.provider, payload])
            .map_err(|err| SmsError::Io(format!("insert balance failed: {err}")))?;
    }
    Ok(())
}

fn insert_reuse_pool(
    tx: &Transaction<'_>,
    reuse_pool: &HashMap<String, Vec<ReusePoolEntry>>,
) -> Result<(), SmsError> {
    let mut stmt = tx
        .prepare(
            "INSERT INTO reuse_pool (provider_bucket, phone_number, service, country, payload_json)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
        )
        .map_err(|err| SmsError::Io(format!("prepare reuse pool insert failed: {err}")))?;
    for (provider_bucket, entries) in reuse_pool {
        for entry in entries {
            let payload = serde_json::to_string(entry).map_err(|err| {
                SmsError::Config(format!("serialize reuse pool entry failed: {err}"))
            })?;
            stmt.execute(params![
                provider_bucket,
                entry.phone_number,
                entry.service,
                entry.country,
                payload,
            ])
            .map_err(|err| SmsError::Io(format!("insert reuse pool entry failed: {err}")))?;
        }
    }
    Ok(())
}

fn insert_reuse_bucket(
    tx: &Transaction<'_>,
    provider_bucket: &str,
    entries: &[ReusePoolEntry],
) -> Result<(), SmsError> {
    let mut stmt = tx
        .prepare(
            "INSERT INTO reuse_pool (provider_bucket, phone_number, service, country, payload_json)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
        )
        .map_err(|err| SmsError::Io(format!("prepare reuse bucket insert failed: {err}")))?;
    for entry in entries {
        let payload = serde_json::to_string(entry)
            .map_err(|err| SmsError::Config(format!("serialize reuse pool entry failed: {err}")))?;
        stmt.execute(params![
            provider_bucket,
            entry.phone_number,
            entry.service,
            entry.country,
            payload,
        ])
        .map_err(|err| SmsError::Io(format!("insert reuse bucket entry failed: {err}")))?;
    }
    Ok(())
}

fn save_openai_regions_tx(
    tx: &Transaction<'_>,
    cache: &OpenAiSmsRegionsCache,
) -> Result<(), SmsError> {
    let payload = serde_json::to_string(cache)
        .map_err(|err| SmsError::Config(format!("serialize openai regions failed: {err}")))?;
    tx.execute(
        "INSERT INTO runtime_meta (key, value_json, updated_at)
             VALUES ('openai_sms_regions_cache', ?1, ?2)
             ON CONFLICT(key) DO UPDATE SET
               value_json = excluded.value_json,
               updated_at = excluded.updated_at",
        params![payload, Utc::now().to_rfc3339()],
    )
    .map_err(|err| SmsError::Io(format!("save openai regions failed: {err}")))?;
    Ok(())
}

fn save_stats_sync_status_tx(
    tx: &Transaction<'_>,
    status: &StatsSyncStatus,
) -> Result<(), SmsError> {
    let payload = serde_json::to_string(status)
        .map_err(|err| SmsError::Config(format!("serialize stats sync status failed: {err}")))?;
    tx.execute(
        "INSERT INTO runtime_meta (key, value_json, updated_at)
             VALUES ('stats_sync_status', ?1, ?2)
             ON CONFLICT(key) DO UPDATE SET
               value_json = excluded.value_json,
               updated_at = excluded.updated_at",
        params![payload, Utc::now().to_rfc3339()],
    )
    .map_err(|err| SmsError::Io(format!("save stats sync status failed: {err}")))?;
    Ok(())
}

impl RuntimeStoreTx<'_, '_> {
    fn apply_batch(
        &mut self,
        batch: &RuntimeStoreBatch,
        options: RuntimeStoreApplyOptions,
    ) -> Result<(), SmsError> {
        if let RuntimeStoreBackend::InMemory { state, .. } = self.backend {
            let mut state = state.lock();
            if batch.clear_logs {
                state.logs.clear();
            }
            if let Some(ticket) = batch.upsert_ticket.as_ref() {
                state.tickets.retain(|current| current.id != ticket.id);
                state.tickets.push(ticket.clone());
            }
            for ticket in &batch.upsert_tickets {
                state.tickets.retain(|current| current.id != ticket.id);
                state.tickets.push(ticket.clone());
            }
            if !batch.delete_ticket_ids.is_empty() {
                state
                    .tickets
                    .retain(|ticket| !batch.delete_ticket_ids.contains(&ticket.id));
            }
            state.logs.extend(batch.log_entries.iter().cloned());
            if state.logs.len() > options.log_limit {
                let start = state.logs.len().saturating_sub(options.log_limit);
                let trimmed = state.logs.split_off(start);
                state.logs = trimmed;
            }
            state
                .activity
                .extend(batch.activity_entries.iter().cloned());
            if state.activity.len() > options.activity_limit {
                state.activity.sort_by(|left, right| {
                    left.timestamp
                        .cmp(&right.timestamp)
                        .then_with(|| left.id.cmp(&right.id))
                });
                let start = state.activity.len().saturating_sub(options.activity_limit);
                let trimmed = state.activity.split_off(start);
                state.activity = trimmed;
            }
            if let Some((provider_bucket, entries)) = batch.reuse_bucket.as_ref() {
                state
                    .reuse_pool
                    .insert(provider_bucket.clone(), entries.clone());
            }
            state.ticket_stats_events.extend(batch.stats_events.iter().cloned());
            if !batch.mark_stats_events_synced.is_empty() {
                for (event_id, synced_at) in &batch.mark_stats_events_synced {
                    if let Some(event) = state
                        .ticket_stats_events
                        .iter_mut()
                        .find(|event| &event.id == event_id)
                    {
                        event.synced_at = Some(*synced_at);
                    }
                }
            }
            if let Some(status) = batch.stats_sync_status.as_ref() {
                state.stats_sync_status = status.clone();
            }
            if let Some(balance) = batch.provider_balance.as_ref() {
                state
                    .provider_balance_cache
                    .retain(|entry| entry.provider != balance.provider);
                state.provider_balance_cache.push(balance.clone());
            }
            if let Some(cache) = batch.openai_regions.as_ref() {
                state.openai_sms_regions_cache = cache.clone();
            }
            return Ok(());
        }
        if batch.clear_logs {
            self.clear_logs()?;
        }
        if let Some(ticket) = batch.upsert_ticket.as_ref() {
            self.upsert_ticket(ticket)?;
        }
        for ticket in &batch.upsert_tickets {
            self.upsert_ticket(ticket)?;
        }
        if !batch.delete_ticket_ids.is_empty() {
            self.delete_tickets(&batch.delete_ticket_ids)?;
        }
        for entry in &batch.log_entries {
            self.append_log(entry)?;
        }
        if !batch.log_entries.is_empty() {
            self.trim_logs(options.log_limit)?;
        }
        for entry in &batch.activity_entries {
            self.append_activity(entry)?;
        }
        if !batch.activity_entries.is_empty() {
            self.trim_activity(options.activity_limit)?;
        }
        if !batch.stats_events.is_empty() {
            insert_ticket_stats_events(&self.tx, &batch.stats_events)?;
        }
        if !batch.mark_stats_events_synced.is_empty() {
            for (event_id, synced_at) in &batch.mark_stats_events_synced {
                self.tx
                    .execute(
                        "UPDATE ticket_stats_events SET synced_at = ?2 WHERE id = ?1",
                        params![event_id, synced_at.to_rfc3339()],
                    )
                    .map_err(|err| SmsError::Io(format!("mark stats event synced failed: {err}")))?;
            }
        }
        if let Some(status) = batch.stats_sync_status.as_ref() {
            save_stats_sync_status_tx(&self.tx, status)?;
        }
        if let Some((provider_bucket, entries)) = batch.reuse_bucket.as_ref() {
            self.replace_reuse_bucket(provider_bucket, entries)?;
        }
        if let Some(balance) = batch.provider_balance.as_ref() {
            self.upsert_provider_balance(balance)?;
        }
        if let Some(cache) = batch.openai_regions.as_ref() {
            self.save_openai_regions(cache)?;
        }
        Ok(())
    }

    fn replace_state(&mut self, state: &RuntimeStateStore) -> Result<(), SmsError> {
        if let RuntimeStoreBackend::InMemory { state: current, .. } = self.backend {
            *current.lock() = state.clone();
            return Ok(());
        }
        self.tx
            .execute_batch(
                "DELETE FROM tickets;
                 DELETE FROM logs;
                 DELETE FROM activity;
                 DELETE FROM ticket_stats_events;
                 DELETE FROM provider_balance_cache;
                 DELETE FROM reuse_pool;
                 DELETE FROM runtime_meta WHERE key IN ('openai_sms_regions_cache', 'stats_sync_status');",
            )
            .map_err(|err| SmsError::Io(format!("clear sqlite runtime state failed: {err}")))?;
        insert_tickets(&self.tx, &state.tickets)?;
        insert_logs(&self.tx, &state.logs)?;
        insert_activity(&self.tx, &state.activity)?;
        insert_ticket_stats_events(&self.tx, &state.ticket_stats_events)?;
        insert_provider_balances(&self.tx, &state.provider_balance_cache)?;
        insert_reuse_pool(&self.tx, &state.reuse_pool)?;
        save_openai_regions_tx(&self.tx, &state.openai_sms_regions_cache)?;
        save_stats_sync_status_tx(&self.tx, &state.stats_sync_status)?;
        Ok(())
    }

    fn upsert_ticket(&mut self, ticket: &TicketRecord) -> Result<(), SmsError> {
        let RuntimeStoreBackend::Sqlite { .. } = self.backend else {
            return Ok(());
        };
        upsert_ticket_tx(&self.tx, ticket)
    }

    fn delete_tickets(&mut self, ticket_ids: &[String]) -> Result<(), SmsError> {
        if ticket_ids.is_empty() {
            return Ok(());
        }
        let placeholders = std::iter::repeat_n("?", ticket_ids.len())
            .collect::<Vec<_>>()
            .join(", ");
        let query = format!("DELETE FROM tickets WHERE id IN ({placeholders})");
        self.tx
            .execute(
                query.as_str(),
                params_from_iter(ticket_ids.iter().map(String::as_str)),
            )
            .map_err(|err| SmsError::Io(format!("delete tickets failed: {err}")))?;
        Ok(())
    }

    fn append_log(&mut self, entry: &LogEntry) -> Result<(), SmsError> {
        self.tx
            .execute(
                "INSERT INTO logs (timestamp, scope, level, message) VALUES (?1, ?2, ?3, ?4)",
                params![
                    entry.timestamp.to_rfc3339(),
                    entry.scope,
                    entry.level,
                    entry.message,
                ],
            )
            .map_err(|err| SmsError::Io(format!("append log failed: {err}")))?;
        Ok(())
    }

    fn trim_logs(&mut self, max_entries: usize) -> Result<(), SmsError> {
        if max_entries == 0 {
            return self.clear_logs();
        }
        self.tx
            .execute(
                "DELETE FROM logs
                 WHERE id NOT IN (
                   SELECT id FROM logs ORDER BY timestamp DESC, id DESC LIMIT ?1
                 )",
                [max_entries as i64],
            )
            .map_err(|err| SmsError::Io(format!("trim logs failed: {err}")))?;
        Ok(())
    }

    fn clear_logs(&mut self) -> Result<(), SmsError> {
        self.tx
            .execute("DELETE FROM logs", [])
            .map_err(|err| SmsError::Io(format!("clear logs failed: {err}")))?;
        Ok(())
    }

    fn append_activity(&mut self, entry: &ActivityEntry) -> Result<(), SmsError> {
        let payload = serde_json::to_string(entry)
            .map_err(|err| SmsError::Config(format!("serialize activity failed: {err}")))?;
        self.tx
            .execute(
                "INSERT INTO activity (id, timestamp, level, kind, payload_json)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    entry.id,
                    entry.timestamp.to_rfc3339(),
                    encode_activity_level(&entry.level),
                    encode_activity_kind(&entry.kind),
                    payload,
                ],
            )
            .map_err(|err| SmsError::Io(format!("append activity failed: {err}")))?;
        Ok(())
    }

    fn trim_activity(&mut self, max_entries: usize) -> Result<(), SmsError> {
        if max_entries == 0 {
            self.tx
                .execute("DELETE FROM activity", [])
                .map_err(|err| SmsError::Io(format!("clear activity failed: {err}")))?;
            return Ok(());
        }
        self.tx
            .execute(
                "DELETE FROM activity
                 WHERE id NOT IN (
                   SELECT id FROM activity ORDER BY timestamp DESC, id DESC LIMIT ?1
                 )",
                [max_entries as i64],
            )
            .map_err(|err| SmsError::Io(format!("trim activity failed: {err}")))?;
        Ok(())
    }

    fn upsert_provider_balance(
        &mut self,
        balance: &ProviderBalanceCacheEntry,
    ) -> Result<(), SmsError> {
        let payload = serde_json::to_string(balance)
            .map_err(|err| SmsError::Config(format!("serialize balance failed: {err}")))?;
        self.tx
            .execute(
                "INSERT INTO provider_balance_cache (provider, payload_json)
                 VALUES (?1, ?2)
                 ON CONFLICT(provider) DO UPDATE SET
                   payload_json = excluded.payload_json",
                params![balance.provider, payload],
            )
            .map_err(|err| SmsError::Io(format!("upsert balance failed: {err}")))?;
        Ok(())
    }

    fn replace_reuse_bucket(
        &mut self,
        provider_bucket: &str,
        entries: &[ReusePoolEntry],
    ) -> Result<(), SmsError> {
        let RuntimeStoreBackend::Sqlite { .. } = self.backend else {
            return Ok(());
        };
        self.tx
            .execute(
                "DELETE FROM reuse_pool WHERE provider_bucket = ?1",
                [provider_bucket],
            )
            .map_err(|err| SmsError::Io(format!("clear reuse bucket failed: {err}")))?;
        insert_reuse_bucket(&self.tx, provider_bucket, entries)
    }

    fn save_openai_regions(&mut self, cache: &OpenAiSmsRegionsCache) -> Result<(), SmsError> {
        let RuntimeStoreBackend::Sqlite { .. } = self.backend else {
            return Ok(());
        };
        save_openai_regions_tx(&self.tx, cache)
    }
}

fn parse_datetime(value: String) -> Result<DateTime<Utc>, SmsError> {
    DateTime::parse_from_rfc3339(&value)
        .map(|value| value.with_timezone(&Utc))
        .map_err(|err| SmsError::Config(format!("parse datetime failed: {err}")))
}

fn parse_optional_datetime(value: Option<String>) -> Option<DateTime<Utc>> {
    value
        .and_then(|item| DateTime::parse_from_rfc3339(&item).ok())
        .map(|item| item.with_timezone(&Utc))
}

fn encode_ticket_status(status: &crate::models::TicketStatus) -> &'static str {
    match status {
        crate::models::TicketStatus::Pending => "pending",
        crate::models::TicketStatus::WaitingCode => "waiting_code",
        crate::models::TicketStatus::CancelPending => "cancel_pending",
        crate::models::TicketStatus::CodeReceived => "code_received",
        crate::models::TicketStatus::Finished => "finished",
        crate::models::TicketStatus::Cancelled => "cancelled",
        crate::models::TicketStatus::Failed => "failed",
    }
}

fn encode_release_action(action: &ReleaseAction) -> &'static str {
    match action {
        ReleaseAction::Finish => "finish",
        ReleaseAction::Cancel => "cancel",
        ReleaseAction::Retry => "retry",
        ReleaseAction::Ban => "ban",
    }
}

fn encode_acquire_path(path: &crate::models::AcquirePath) -> &'static str {
    match path {
        crate::models::AcquirePath::FreshAcquire => "fresh_acquire",
        crate::models::AcquirePath::ExactReuse => "exact_reuse",
        crate::models::AcquirePath::IntentReuse => "intent_reuse",
        crate::models::AcquirePath::SameActivationRetry => "same_activation_retry",
    }
}

fn decode_acquire_path(value: &str) -> crate::models::AcquirePath {
    match value {
        "exact_reuse" => crate::models::AcquirePath::ExactReuse,
        "intent_reuse" => crate::models::AcquirePath::IntentReuse,
        "same_activation_retry" => crate::models::AcquirePath::SameActivationRetry,
        _ => crate::models::AcquirePath::FreshAcquire,
    }
}

fn decode_ticket_status(value: &str) -> crate::models::TicketStatus {
    match value {
        "waiting_code" => crate::models::TicketStatus::WaitingCode,
        "cancel_pending" => crate::models::TicketStatus::CancelPending,
        "code_received" => crate::models::TicketStatus::CodeReceived,
        "finished" => crate::models::TicketStatus::Finished,
        "cancelled" => crate::models::TicketStatus::Cancelled,
        "failed" => crate::models::TicketStatus::Failed,
        _ => crate::models::TicketStatus::Pending,
    }
}

fn encode_routing_execution_mode(mode: &crate::models::RoutingExecutionMode) -> &'static str {
    match mode {
        crate::models::RoutingExecutionMode::Sequential => "sequential",
        crate::models::RoutingExecutionMode::Random => "random",
    }
}

fn decode_routing_execution_mode(value: &str) -> crate::models::RoutingExecutionMode {
    match value {
        "random" => crate::models::RoutingExecutionMode::Random,
        _ => crate::models::RoutingExecutionMode::Sequential,
    }
}

fn encode_ticket_stats_outcome(outcome: &crate::models::TicketStatsOutcome) -> &'static str {
    match outcome {
        crate::models::TicketStatsOutcome::Acquired => "acquired",
        crate::models::TicketStatsOutcome::CodeReceived => "code_received",
        crate::models::TicketStatsOutcome::Finished => "finished",
        crate::models::TicketStatsOutcome::Cancelled => "cancelled",
        crate::models::TicketStatsOutcome::CancelPending => "cancel_pending",
        crate::models::TicketStatsOutcome::Failed => "failed",
        crate::models::TicketStatsOutcome::Banned => "banned",
        crate::models::TicketStatsOutcome::RetryRequested => "retry_requested",
    }
}

fn decode_ticket_stats_outcome(value: &str) -> crate::models::TicketStatsOutcome {
    match value {
        "code_received" => crate::models::TicketStatsOutcome::CodeReceived,
        "finished" => crate::models::TicketStatsOutcome::Finished,
        "cancelled" => crate::models::TicketStatsOutcome::Cancelled,
        "cancel_pending" => crate::models::TicketStatsOutcome::CancelPending,
        "failed" => crate::models::TicketStatsOutcome::Failed,
        "banned" => crate::models::TicketStatsOutcome::Banned,
        "retry_requested" => crate::models::TicketStatsOutcome::RetryRequested,
        _ => crate::models::TicketStatsOutcome::Acquired,
    }
}

fn decode_release_action(value: &str) -> ReleaseAction {
    match value {
        "finish" => ReleaseAction::Finish,
        "retry" => ReleaseAction::Retry,
        "ban" => ReleaseAction::Ban,
        _ => ReleaseAction::Cancel,
    }
}

fn encode_activity_level(level: &crate::models::ActivityLevel) -> &'static str {
    match level {
        crate::models::ActivityLevel::Info => "info",
        crate::models::ActivityLevel::Warn => "warn",
        crate::models::ActivityLevel::Error => "error",
    }
}

fn encode_activity_kind(kind: &crate::models::ActivityKind) -> &'static str {
    match kind {
        crate::models::ActivityKind::TicketEvent => "ticket_event",
        crate::models::ActivityKind::RoutingEvent => "routing_event",
        crate::models::ActivityKind::ReleaseEvent => "release_event",
    }
}
