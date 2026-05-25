use crate::error::SmsError;
use crate::models::{
    ActivityEntry, LogEntry, OpenAiSmsRegionsCache, ProviderBalanceCacheEntry, ReleaseAction,
    ReusePoolEntry, RuntimeStateStore, TicketRecord,
};
use chrono::{DateTime, Utc};
use rusqlite::{Connection, OptionalExtension, Transaction, params, params_from_iter};
use std::collections::HashMap;
use std::error::Error as StdError;
use std::path::{Path, PathBuf};

const RUNTIME_DB_SCHEMA_VERSION: i64 = 1;
const RELEASE_OWNER_KEY: &str = "release_owner";

#[derive(Debug, Clone)]
pub struct RuntimeStore {
    path: PathBuf,
}

struct RuntimeStoreTx<'store, 'conn> {
    store: &'store RuntimeStore,
    tx: Transaction<'conn>,
}

#[derive(Debug, Default)]
pub struct RuntimeStoreBatch {
    pub upsert_ticket: Option<TicketRecord>,
    pub delete_ticket_ids: Vec<String>,
    pub log_entries: Vec<LogEntry>,
    pub activity_entries: Vec<ActivityEntry>,
    pub reuse_bucket: Option<(String, Vec<ReusePoolEntry>)>,
    pub provider_balance: Option<ProviderBalanceCacheEntry>,
    pub openai_regions: Option<OpenAiSmsRegionsCache>,
    pub clear_logs: bool,
}

impl RuntimeStoreBatch {
    pub fn is_empty(&self) -> bool {
        self.upsert_ticket.is_none()
            && self.delete_ticket_ids.is_empty()
            && self.log_entries.is_empty()
            && self.activity_entries.is_empty()
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

impl RuntimeStore {
    pub fn open(path: impl Into<PathBuf>) -> Result<Self, SmsError> {
        let store = Self { path: path.into() };
        let conn = store.connect()?;
        store.initialize(&conn)?;
        Ok(store)
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn load_state(&self) -> Result<RuntimeStateStore, SmsError> {
        let conn = self.connect()?;
        let tickets = self.load_tickets(&conn)?;
        let logs = self.load_logs(&conn)?;
        let activity = self.load_activity(&conn)?;
        let provider_balance_cache = self.load_provider_balances(&conn)?;
        let reuse_pool = self.load_reuse_pool(&conn)?;
        let openai_sms_regions_cache = self.load_openai_regions(&conn)?;
        Ok(RuntimeStateStore {
            tickets,
            logs,
            activity,
            provider_balance_cache,
            reuse_pool,
            openai_sms_regions_cache,
        })
    }

    pub fn replace_release_owner(&self, lease: Option<&ReleaseOwnerLease>) -> Result<(), SmsError> {
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
        let mut conn = self.connect()?;
        let tx = conn
            .transaction()
            .map_err(|err| SmsError::Io(format!("begin sqlite tx failed: {err}")))?;
        let mut runtime_tx = RuntimeStoreTx { store: self, tx };
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
        let conn = self.connect()?;
        let mut stmt = conn
            .prepare(
                "SELECT id, pending_release_action, auto_release_at, release_retry_deadline_at, release_retry_count
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
        let conn = Connection::open(&self.path)
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

    fn load_tickets(&self, conn: &Connection) -> Result<Vec<TicketRecord>, SmsError> {
        let mut stmt = conn
            .prepare("SELECT payload_json FROM tickets ORDER BY updated_at DESC, id DESC")
            .map_err(|err| SmsError::Io(format!("prepare ticket load failed: {err}")))?;
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|err| SmsError::Io(format!("query ticket load failed: {err}")))?;
        rows.map(|row| {
            let payload =
                row.map_err(|err| SmsError::Io(format!("read ticket row failed: {err}")))?;
            serde_json::from_str::<TicketRecord>(&payload)
                .map_err(|err| SmsError::Config(format!("parse ticket payload failed: {err}")))
        })
        .collect()
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

    fn insert_tickets(
        &self,
        tx: &Transaction<'_>,
        tickets: &[TicketRecord],
    ) -> Result<(), SmsError> {
        let mut stmt = tx
            .prepare(
                "INSERT INTO tickets (
                    id, payload_json, status, updated_at, next_release_attempt_at, pending_release_action
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            )
            .map_err(|err| SmsError::Io(format!("prepare ticket insert failed: {err}")))?;
        for ticket in tickets {
            let payload = serde_json::to_string(ticket)
                .map_err(|err| SmsError::Config(format!("serialize ticket failed: {err}")))?;
            stmt.execute(params![
                ticket.id,
                payload,
                encode_ticket_status(&ticket.status),
                ticket.updated_at.to_rfc3339(),
                ticket
                    .next_release_attempt_at
                    .map(|value| value.to_rfc3339()),
                ticket
                    .pending_release_action
                    .as_ref()
                    .map(encode_release_action),
            ])
            .map_err(|err| SmsError::Io(format!("insert ticket failed: {err}")))?;
        }
        Ok(())
    }

    fn upsert_ticket_tx(
        &self,
        tx: &Transaction<'_>,
        ticket: &TicketRecord,
    ) -> Result<(), SmsError> {
        let payload = serde_json::to_string(ticket)
            .map_err(|err| SmsError::Config(format!("serialize ticket failed: {err}")))?;
        tx.execute(
            "INSERT INTO tickets (
                id, payload_json, status, updated_at, next_release_attempt_at, pending_release_action
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(id) DO UPDATE SET
                payload_json = excluded.payload_json,
                status = excluded.status,
                updated_at = excluded.updated_at,
                next_release_attempt_at = excluded.next_release_attempt_at,
                pending_release_action = excluded.pending_release_action",
            params![
                ticket.id,
                payload,
                encode_ticket_status(&ticket.status),
                ticket.updated_at.to_rfc3339(),
                ticket.next_release_attempt_at.map(|value| value.to_rfc3339()),
                ticket.pending_release_action.as_ref().map(encode_release_action),
            ],
        )
        .map_err(|err| SmsError::Io(format!("upsert ticket failed: {err}")))?;
        Ok(())
    }

    fn insert_logs(&self, tx: &Transaction<'_>, logs: &[LogEntry]) -> Result<(), SmsError> {
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

    fn insert_activity(
        &self,
        tx: &Transaction<'_>,
        activity: &[ActivityEntry],
    ) -> Result<(), SmsError> {
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

    fn insert_provider_balances(
        &self,
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
        &self,
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
        &self,
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
            .map_err(|err| SmsError::Io(format!("insert reuse bucket entry failed: {err}")))?;
        }
        Ok(())
    }

    fn save_openai_regions_tx(
        &self,
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
}

impl RuntimeStoreTx<'_, '_> {
    fn apply_batch(
        &mut self,
        batch: &RuntimeStoreBatch,
        options: RuntimeStoreApplyOptions,
    ) -> Result<(), SmsError> {
        if batch.clear_logs {
            self.clear_logs()?;
        }
        if let Some(ticket) = batch.upsert_ticket.as_ref() {
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
        self.tx
            .execute_batch(
                "DELETE FROM tickets;
                 DELETE FROM logs;
                 DELETE FROM activity;
                 DELETE FROM provider_balance_cache;
                 DELETE FROM reuse_pool;
                 DELETE FROM runtime_meta WHERE key = 'openai_sms_regions_cache';",
            )
            .map_err(|err| SmsError::Io(format!("clear sqlite runtime state failed: {err}")))?;
        self.store.insert_tickets(&self.tx, &state.tickets)?;
        self.store.insert_logs(&self.tx, &state.logs)?;
        self.store.insert_activity(&self.tx, &state.activity)?;
        self.store
            .insert_provider_balances(&self.tx, &state.provider_balance_cache)?;
        self.store.insert_reuse_pool(&self.tx, &state.reuse_pool)?;
        self.store
            .save_openai_regions_tx(&self.tx, &state.openai_sms_regions_cache)?;
        Ok(())
    }

    fn upsert_ticket(&mut self, ticket: &TicketRecord) -> Result<(), SmsError> {
        self.store.upsert_ticket_tx(&self.tx, ticket)
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
        self.tx
            .execute(
                "DELETE FROM reuse_pool WHERE provider_bucket = ?1",
                [provider_bucket],
            )
            .map_err(|err| SmsError::Io(format!("clear reuse bucket failed: {err}")))?;
        self.store
            .insert_reuse_bucket(&self.tx, provider_bucket, entries)
    }

    fn save_openai_regions(&mut self, cache: &OpenAiSmsRegionsCache) -> Result<(), SmsError> {
        self.store.save_openai_regions_tx(&self.tx, cache)
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
