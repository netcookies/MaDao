type Env = {
  DB: D1Database;
  API_TOKEN?: string;
};

type TicketStatsOutcome =
  | 'acquired'
  | 'code_received'
  | 'finished'
  | 'cancelled'
  | 'cancel_pending'
  | 'failed'
  | 'banned'
  | 'retry_requested';

type TicketStatsEvent = {
  id: string;
  ticket_id: string;
  provider: string;
  service: string;
  country: string;
  operator?: string | null;
  outcome: TicketStatsOutcome;
  status: string;
  occurred_at: string;
  price?: number | null;
  receive_duration_secs?: number | null;
  message?: string | null;
};

type UploadPayload = {
  app_instance_id: string;
  app_version: string;
  events: TicketStatsEvent[];
};

type StatsQuery = {
  service?: string | null;
  country?: string | null;
  operator?: string | null;
  provider?: string | null;
  lookback_hours?: number | null;
};

type DashboardTotals = {
  total_users: number;
  active_24h: number;
  active_7d: number;
  total_events: number;
  total_tickets: number;
  first_event: string | null;
  last_event: string | null;
};

type DashboardProviderRow = {
  provider: string;
  tickets: number;
  users: number;
};

type DashboardServiceRow = {
  service: string;
  tickets: number;
};

type DashboardUserRow = {
  app_instance_id: string;
  app_version: string;
  last_seen: string;
  event_count: number;
};

type DashboardSnapshot = {
  refreshed_at: string;
  totals: DashboardTotals;
  top_providers: DashboardProviderRow[];
  top_services: DashboardServiceRow[];
  recent_users: DashboardUserRow[];
};

type SummaryItem = {
  provider: string;
  service: string;
  country: string;
  operator: string;
  total: number;
  success_count: number;
  success_rate: number;
  cancelled_count: number;
  banned_count: number;
  failed_count: number;
  avg_effective_price: number | null;
  avg_receive_time_secs: number | null;
};

type SummaryResponse = {
  lookback_hours: number;
  items: SummaryItem[];
};

type SummaryRow = {
  provider: string;
  service: string;
  country: string;
  operator: string;
  total: number;
  success_count: number;
  cancelled_count: number;
  banned_count: number;
  failed_count: number;
  avg_effective_price: number | null;
  avg_receive_time_secs: number | null;
};

const DASHBOARD_SNAPSHOT_KEY = 'dashboard';
const DASHBOARD_CACHE_TTL_SECONDS = 300;
const SUMMARY_CACHE_TTL_SECONDS = 300;
const PRECOMPUTED_SUMMARY_LOOKBACK_HOURS = [24, 72, 168] as const;
const EVENT_RETENTION_DAYS = 7;
const EVENT_CLEANUP_BATCH_SIZE = 1000;
const SNAPSHOT_REFRESH_CRON = '0 * * * *';
const EVENT_CLEANUP_CRON = '55 2 * * *';

let schemaReady: Promise<void> | null = null;

function defaultCache(): Cache {
  return (caches as unknown as { default: Cache }).default;
}

function json(data: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...headers,
    },
  });
}

function html(body: string, status = 200, headers: HeadersInit = {}) {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', ...headers },
  });
}

function unauthorizedHtml() {
  return html('Unauthorized', 401, {
    'www-authenticate': 'Basic realm="MaDao Stats"',
  });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function dashboardCacheKey(request: Request) {
  const url = new URL(request.url);
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  return new Request(url.toString(), { method: 'GET' });
}

function emptyDashboardSnapshot(now = new Date().toISOString()): DashboardSnapshot {
  return {
    refreshed_at: now,
    totals: {
      total_users: 0,
      active_24h: 0,
      active_7d: 0,
      total_events: 0,
      total_tickets: 0,
      first_event: null,
      last_event: null,
    },
    top_providers: [],
    top_services: [],
    recent_users: [],
  };
}

async function computeDashboardSnapshot(env: Env): Promise<DashboardSnapshot> {
  await ensureSchema(env);

  const now = new Date();
  const refreshedAt = now.toISOString();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const totalsResult = await env.DB.prepare(`
    SELECT COUNT(*) as total_events,
           COUNT(DISTINCT ticket_id) as total_tickets,
           COUNT(DISTINCT app_instance_id) as total_users,
           COUNT(DISTINCT CASE WHEN occurred_at > ? THEN app_instance_id END) as active_24h,
           COUNT(DISTINCT app_instance_id) as active_7d,
           MIN(occurred_at) as first_event,
           MAX(occurred_at) as last_event
    FROM ticket_stats_events
    WHERE occurred_at > ?
  `).bind(dayAgo, weekAgo).first<DashboardTotals>();

  const topProviders = await env.DB.prepare(`
    SELECT provider, COUNT(DISTINCT ticket_id) as tickets, COUNT(DISTINCT app_instance_id) as users
    FROM ticket_stats_events
    WHERE occurred_at > ?
    GROUP BY provider ORDER BY tickets DESC LIMIT 5
  `).bind(weekAgo).all<DashboardProviderRow>();

  const topServices = await env.DB.prepare(`
    SELECT service, COUNT(DISTINCT ticket_id) as tickets
    FROM ticket_stats_events
    WHERE occurred_at > ?
    GROUP BY service ORDER BY tickets DESC LIMIT 5
  `).bind(weekAgo).all<DashboardServiceRow>();

  const recentUsers = await env.DB.prepare(`
    SELECT app_instance_id, app_version, MAX(occurred_at) as last_seen, COUNT(*) as event_count
    FROM ticket_stats_events
    WHERE occurred_at > ?
    GROUP BY app_instance_id
    ORDER BY last_seen DESC LIMIT 10
  `).bind(weekAgo).all<DashboardUserRow>();

  const empty = emptyDashboardSnapshot(refreshedAt);
  const totals = totalsResult ? {
    total_users: Number(totalsResult.total_users ?? 0),
    active_24h: Number(totalsResult.active_24h ?? 0),
    active_7d: Number(totalsResult.active_7d ?? 0),
    total_events: Number(totalsResult.total_events ?? 0),
    total_tickets: Number(totalsResult.total_tickets ?? 0),
    first_event: totalsResult.first_event ?? null,
    last_event: totalsResult.last_event ?? null,
  } : empty.totals;

  return {
    refreshed_at: refreshedAt,
    totals,
    top_providers: (topProviders.results ?? []).map((row) => ({
      provider: row.provider,
      tickets: Number(row.tickets ?? 0),
      users: Number(row.users ?? 0),
    })),
    top_services: (topServices.results ?? []).map((row) => ({
      service: row.service,
      tickets: Number(row.tickets ?? 0),
    })),
    recent_users: (recentUsers.results ?? []).map((row) => ({
      app_instance_id: row.app_instance_id,
      app_version: row.app_version,
      last_seen: row.last_seen,
      event_count: Number(row.event_count ?? 0),
    })),
  };
}

async function saveDashboardSnapshot(env: Env, snapshot: DashboardSnapshot) {
  await env.DB.prepare(`
    INSERT INTO stats_snapshots (key, payload_json, refreshed_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      payload_json = excluded.payload_json,
      refreshed_at = excluded.refreshed_at
  `).bind(DASHBOARD_SNAPSHOT_KEY, JSON.stringify(snapshot), snapshot.refreshed_at).run();
}

async function refreshDashboardSnapshot(env: Env): Promise<DashboardSnapshot> {
  const snapshot = await computeDashboardSnapshot(env);
  await saveDashboardSnapshot(env, snapshot);
  return snapshot;
}

async function loadDashboardSnapshot(env: Env): Promise<DashboardSnapshot | null> {
  const row = await loadSnapshotRow(env, DASHBOARD_SNAPSHOT_KEY);
  if (!row?.payload_json) return null;
  try {
    return JSON.parse(row.payload_json) as DashboardSnapshot;
  } catch {
    return null;
  }
}

async function getDashboardSnapshot(env: Env): Promise<DashboardSnapshot> {
  const snapshot = await loadDashboardSnapshot(env);
  if (snapshot) return snapshot;
  return emptyDashboardSnapshot();
}

async function renderDashboard(request: Request, env: Env, ctx: ExecutionContext) {
  const cacheKey = dashboardCacheKey(request);
  const cached = await defaultCache().match(cacheKey);
  if (cached) return cached;

  const snapshot = await getDashboardSnapshot(env);
  const response = renderDashboardSnapshot(snapshot);
  ctx.waitUntil(defaultCache().put(cacheKey, response.clone()));
  return response;
}

async function refreshDashboard(request: Request, env: Env) {
  if (!isAuthorized(request, env)) {
    return json({ message: 'unauthorized' }, 401);
  }
  await refreshCommonSnapshots(env);
  const snapshot = await getDashboardSnapshot(env);
  await defaultCache().delete(dashboardCacheKey(request));
  return json({
    refreshed_at: snapshot.refreshed_at,
    total_events: snapshot.totals.total_events,
    total_users: snapshot.totals.total_users,
  });
}

function summarySnapshotKey(lookbackHours: number) {
  return `summary:${lookbackHours}`;
}

function isPrecomputedSummaryQuery(query: StatsQuery, lookbackHours: number) {
  return query.service == null
    && query.country == null
    && query.operator == null
    && query.provider == null
    && PRECOMPUTED_SUMMARY_LOOKBACK_HOURS.includes(lookbackHours as typeof PRECOMPUTED_SUMMARY_LOOKBACK_HOURS[number]);
}

async function saveSummarySnapshot(env: Env, response: SummaryResponse) {
  const refreshedAt = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO stats_snapshots (key, payload_json, refreshed_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      payload_json = excluded.payload_json,
      refreshed_at = excluded.refreshed_at
  `).bind(summarySnapshotKey(response.lookback_hours), JSON.stringify(response), refreshedAt).run();
}

async function loadSummarySnapshot(env: Env, lookbackHours: number): Promise<SummaryResponse | null> {
  const row = await loadSnapshotRow(env, summarySnapshotKey(lookbackHours));
  if (!row?.payload_json) return null;
  try {
    return JSON.parse(row.payload_json) as SummaryResponse;
  } catch {
    return null;
  }
}

async function refreshSummarySnapshot(env: Env, lookbackHours: number): Promise<SummaryResponse> {
  const response = await computeSummary(env, {
    lookback_hours: lookbackHours,
  });
  await saveSummarySnapshot(env, response);
  return response;
}

async function refreshCommonSnapshots(env: Env) {
  await refreshDashboardSnapshot(env);
  for (const lookbackHours of PRECOMPUTED_SUMMARY_LOOKBACK_HOURS) {
    await refreshSummarySnapshot(env, lookbackHours);
  }
}

async function deleteOldEvents(env: Env) {
  await ensureSchema(env);
  const cutoff = new Date(Date.now() - EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const result = await env.DB.prepare(`
    DELETE FROM ticket_stats_events
    WHERE id IN (
      SELECT id FROM ticket_stats_events
      WHERE occurred_at < ?
      ORDER BY occurred_at
      LIMIT ?
    )
  `).bind(cutoff, EVENT_CLEANUP_BATCH_SIZE).run();

  return Number(result.meta.changes ?? 0);
}

function shouldRunDailyCleanup(cron: string) {
  return cron === EVENT_CLEANUP_CRON;
}

function shouldRefreshCommonSnapshots(cron: string) {
  return cron === SNAPSHOT_REFRESH_CRON;
}

async function loadSnapshotRow(env: Env, key: string) {
  try {
    return await env.DB.prepare(`
      SELECT payload_json, refreshed_at FROM stats_snapshots WHERE key = ?
    `).bind(key).first<{ payload_json: string; refreshed_at: string }>();
  } catch (error) {
    if (isMissingSnapshotTableError(error)) return null;
    throw error;
  }
}

function isMissingSnapshotTableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('no such table') && message.includes('stats_snapshots');
}

function renderDashboardSnapshot(snapshot: DashboardSnapshot) {
  const { totals } = snapshot;
  const firstEvent = totals.first_event ?? '-';
  const lastEvent = totals.last_event ?? '-';

  const providerRows = snapshot.top_providers
    .map((r) => `<tr><td>${esc(r.provider)}</td><td>${r.tickets}</td><td>${r.users}</td></tr>`)
    .join('');

  const serviceRows = snapshot.top_services
    .map((r) => `<tr><td>${esc(r.service)}</td><td>${r.tickets}</td></tr>`)
    .join('');

  const userRows = snapshot.recent_users
    .map((r) => `<tr><td title="${esc(r.app_instance_id)}">${esc(r.app_instance_id.slice(0, 8))}...</td><td>${esc(r.app_version)}</td><td>${esc(r.last_seen)}</td><td>${r.event_count}</td></tr>`)
    .join('');

  return html(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MaDao Stats</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0d1117;color:#c9d1d9;padding:24px;min-height:100vh}
h1{font-size:20px;font-weight:600;margin-bottom:24px;color:#f0f6fc}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:32px}
.card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px}
.card .label{font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#8b949e;margin-bottom:6px}
.card .value{font-size:24px;font-weight:700;color:#f0f6fc}
.card .sub{font-size:11px;color:#8b949e;margin-top:4px}
h2{font-size:14px;font-weight:600;color:#f0f6fc;margin:24px 0 12px}
table{width:100%;border-collapse:collapse;background:#161b22;border:1px solid #30363d;border-radius:8px;overflow:hidden;margin-bottom:24px}
th,td{padding:10px 14px;text-align:left;font-size:13px;border-bottom:1px solid #21262d}
th{background:#0d1117;color:#8b949e;font-weight:500;font-size:11px;text-transform:uppercase;letter-spacing:0.3px}
td{color:#c9d1d9}
tr:last-child td{border-bottom:none}
.muted{color:#8b949e}
</style>
</head>
<body>
<h1>MaDao Stats Dashboard</h1>
<div class="grid">
  <div class="card"><div class="label">Users (7d)</div><div class="value">${totals.total_users}</div><div class="sub">Retained window</div></div>
  <div class="card"><div class="label">Active (24h)</div><div class="value">${totals.active_24h}</div></div>
  <div class="card"><div class="label">Active (7d)</div><div class="value">${totals.active_7d}</div></div>
  <div class="card"><div class="label">Events (7d)</div><div class="value">${totals.total_events}</div></div>
  <div class="card"><div class="label">Tickets (7d)</div><div class="value">${totals.total_tickets}</div></div>
</div>
<p class="muted" style="margin-bottom:24px;font-size:12px">Refreshed: ${esc(snapshot.refreshed_at)} · First event: ${esc(firstEvent)} · Last event: ${esc(lastEvent)}</p>

<h2>Top Providers (7d)</h2>
<table><thead><tr><th>Provider</th><th>Tickets</th><th>Users</th></tr></thead><tbody>${providerRows || '<tr><td colspan="3" class="muted">No data</td></tr>'}</tbody></table>

<h2>Top Services (7d)</h2>
<table><thead><tr><th>Service</th><th>Tickets</th></tr></thead><tbody>${serviceRows || '<tr><td colspan="2" class="muted">No data</td></tr>'}</tbody></table>

<h2>Recent Users</h2>
<table><thead><tr><th>Instance</th><th>Version</th><th>Last Seen</th><th>Events</th></tr></thead><tbody>${userRows || '<tr><td colspan="4" class="muted">No data</td></tr>'}</tbody></table>
</body>
</html>`, 200, {
    'cache-control': `max-age=${DASHBOARD_CACHE_TTL_SECONDS}`,
  });
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function isAuthorized(request: Request, env: Env) {
  const token = env.API_TOKEN?.trim();
  if (!token) return false;
  const header = request.headers.get('authorization') ?? '';
  if (header === `Bearer ${token}`) return true;
  if (!header.startsWith('Basic ')) return false;
  try {
    const decoded = atob(header.slice('Basic '.length));
    if (decoded === token) return true;
    const separator = decoded.indexOf(':');
    return separator >= 0
      ? decoded.slice(0, separator) === token || decoded.slice(separator + 1) === token
      : false;
  } catch {
    return false;
  }
}

async function ensureSchema(env: Env) {
  if (!schemaReady) {
    schemaReady = setupSchema(env).catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

async function setupSchema(env: Env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS ticket_stats_events (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL,
      app_instance_id TEXT NOT NULL,
      app_version TEXT NOT NULL,
      provider TEXT NOT NULL,
      service TEXT NOT NULL,
      country TEXT NOT NULL,
      operator TEXT,
      outcome TEXT NOT NULL,
      status TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      price REAL,
      receive_duration_secs REAL,
      message TEXT
    )
  `).run();
  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_ticket_stats_events_lookup
      ON ticket_stats_events(service, country, operator, provider, occurred_at)
  `).run();
  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_ticket_stats_events_occurred_at
      ON ticket_stats_events(occurred_at)
  `).run();
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS stats_snapshots (
      key TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL,
      refreshed_at TEXT NOT NULL
    )
  `).run();
  // Migrate existing tables that lack new columns
  await env.DB.prepare(`ALTER TABLE ticket_stats_events ADD COLUMN price REAL`).run().catch(() => {});
  await env.DB.prepare(`ALTER TABLE ticket_stats_events ADD COLUMN receive_duration_secs REAL`).run().catch(() => {});
}

async function uploadEvents(request: Request, env: Env) {
  if (!isAuthorized(request, env)) {
    return json({ message: 'unauthorized' }, 401);
  }
  const payload = await request.json<UploadPayload>();
  if (!payload.app_instance_id || !payload.app_version || !Array.isArray(payload.events)) {
    return json({ message: 'invalid payload' }, 400);
  }

  await ensureSchema(env);
  const statements = payload.events.map((event) =>
    env.DB.prepare(`
      INSERT OR REPLACE INTO ticket_stats_events (
        id, ticket_id, app_instance_id, app_version, provider, service, country, operator,
        outcome, status, occurred_at, price, receive_duration_secs, message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      event.id,
      event.ticket_id,
      payload.app_instance_id,
      payload.app_version,
      event.provider,
      event.service,
      event.country,
      event.operator ?? null,
      event.outcome,
      event.status,
      event.occurred_at,
      event.price ?? null,
      event.receive_duration_secs ?? null,
      event.message ?? null,
    )
  );
  if (statements.length > 0) {
    await env.DB.batch(statements);
  }
  return json({ accepted: payload.events.length });
}

function buildStatsQuery(request: Request): { query: StatsQuery; lookbackHours: number } {
  const url = new URL(request.url);
  const rawLookbackHours = Number(url.searchParams.get('lookback_hours') ?? '24');
  return {
    query: {
      service: url.searchParams.get('service'),
      country: url.searchParams.get('country'),
      operator: url.searchParams.get('operator'),
      provider: url.searchParams.get('provider'),
      lookback_hours: rawLookbackHours,
    },
    lookbackHours: Number.isFinite(rawLookbackHours) ? Math.max(1, rawLookbackHours) : 24,
  };
}

async function computeSummary(env: Env, query: StatsQuery): Promise<SummaryResponse> {
  await ensureSchema(env);
  const lookbackHours = Number.isFinite(query.lookback_hours) ? Math.max(1, Number(query.lookback_hours)) : 24;
  const lowerBound = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();
  const rows = await env.DB.prepare(
    `
    WITH filtered_events AS (
      SELECT *
      FROM ticket_stats_events
      WHERE occurred_at >= ?
        AND (? IS NULL OR service = ?)
        AND (? IS NULL OR country = ?)
        AND (? IS NULL OR COALESCE(operator, 'any') = ?)
        AND (? IS NULL OR provider = ?)
    ),
    ticket_agg AS (
      SELECT
        ticket_id,
        provider,
        service,
        country,
        operator,
        MAX(price) AS price,
        SUM(CASE WHEN outcome = 'code_received' THEN 1 ELSE 0 END) AS code_received_count,
        MAX(CASE WHEN outcome = 'code_received' THEN receive_duration_secs END) AS last_receive_duration,
        MAX(CASE WHEN outcome IN ('finished', 'code_received') THEN 1 ELSE 0 END) AS is_success,
        MAX(CASE WHEN outcome = 'cancelled' THEN 1 ELSE 0 END) AS is_cancelled,
        MAX(CASE WHEN outcome = 'banned' THEN 1 ELSE 0 END) AS is_banned,
        MAX(CASE WHEN outcome = 'failed' THEN 1 ELSE 0 END) AS is_failed
      FROM filtered_events
      GROUP BY ticket_id, provider, service, country, operator
    )
    SELECT
      provider,
      service,
      country,
      COALESCE(operator, 'any') AS operator,
      COUNT(*) AS total,
      SUM(is_success) AS success_count,
      SUM(is_cancelled) AS cancelled_count,
      SUM(is_banned) AS banned_count,
      SUM(is_failed) AS failed_count,
      AVG(CASE WHEN code_received_count > 0 AND price IS NOT NULL THEN price / code_received_count END) AS avg_effective_price,
      AVG(last_receive_duration) AS avg_receive_time_secs
    FROM ticket_agg
    GROUP BY provider, service, country, COALESCE(operator, 'any')
    ORDER BY success_count DESC, total DESC
    `
  )
    .bind(
      lowerBound,
      query.service ?? null, query.service ?? null,
      query.country ?? null, query.country ?? null,
      query.operator ?? null, query.operator ?? null,
      query.provider ?? null, query.provider ?? null,
    )
    .all<SummaryRow>();

  const items: SummaryItem[] = (rows.results ?? []).map((row) => {
    const total = Number(row.total ?? 0);
    const successCount = Number(row.success_count ?? 0);
    return {
      provider: row.provider,
      service: row.service,
      country: row.country,
      operator: row.operator,
      total,
      success_count: successCount,
      success_rate: total > 0 ? successCount / total : 0,
      cancelled_count: Number(row.cancelled_count ?? 0),
      banned_count: Number(row.banned_count ?? 0),
      failed_count: Number(row.failed_count ?? 0),
      avg_effective_price: row.avg_effective_price != null ? Number(row.avg_effective_price) : null,
      avg_receive_time_secs: row.avg_receive_time_secs != null ? Number(row.avg_receive_time_secs) : null,
    };
  });

  return {
    lookback_hours: lookbackHours,
    items,
  };
}

function cachedJson(responseData: unknown, ttlSeconds: number) {
  return json(responseData, 200, {
    'cache-control': `max-age=${ttlSeconds}`,
  });
}

async function querySnapshotSummary(request: Request, env: Env, ctx: ExecutionContext) {
  const cacheKey = new Request(request.url, { method: 'GET' });
  const cached = await defaultCache().match(cacheKey);
  if (cached) return cached;

  const { query, lookbackHours } = buildStatsQuery(request);
  if (!isPrecomputedSummaryQuery(query, lookbackHours)) {
    return json({
      message: 'summary snapshot only supports unfiltered lookback_hours=24,72,168',
    }, 400);
  }

  const snapshot = await loadSummarySnapshot(env, lookbackHours);
  if (!snapshot) {
    return json({
      message: 'summary snapshot is not ready; wait for cron or call the admin refresh endpoint',
    }, 503, {
      'retry-after': '300',
    });
  }

  const response = cachedJson(snapshot, SUMMARY_CACHE_TTL_SECONDS);
  ctx.waitUntil(defaultCache().put(cacheKey, response.clone()));
  return response;
}

async function queryRealtimeSummary(request: Request, env: Env, ctx: ExecutionContext) {
  if (!isAuthorized(request, env)) {
    return json({ message: 'unauthorized' }, 401);
  }
  const cacheKey = new Request(request.url, { method: 'GET' });
  const cached = await defaultCache().match(cacheKey);
  if (cached) return cached;

  const { query } = buildStatsQuery(request);
  const response = cachedJson(await computeSummary(env, query), SUMMARY_CACHE_TTL_SECONDS);
  ctx.waitUntil(defaultCache().put(cacheKey, response.clone()));
  return response;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    try {
      const url = new URL(request.url);
      if (request.method === 'GET' && url.pathname === '/') {
        return renderDashboard(request, env, ctx);
      }
      if (request.method === 'POST' && url.pathname === '/v1/admin/dashboard/refresh') {
        return refreshDashboard(request, env);
      }
      if (request.method === 'GET' && url.pathname === '/v1/admin/summary') {
        return queryRealtimeSummary(request, env, ctx);
      }
      if (request.method === 'POST' && url.pathname === '/v1/events') {
        return uploadEvents(request, env);
      }
      if (request.method === 'GET' && url.pathname === '/v1/summary') {
        return querySnapshotSummary(request, env, ctx);
      }
      if (request.method === 'GET' && url.pathname === '/health') {
        return json({ status: 'ok' });
      }
      return json({ message: 'not found' }, 404);
    } catch (error) {
      console.error(errorMessage(error));
      return json({ message: 'internal error' }, 500);
    }
  },
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil((async () => {
      if (shouldRunDailyCleanup(event.cron)) {
        await deleteOldEvents(env);
      }
      if (shouldRefreshCommonSnapshots(event.cron)) {
        await refreshCommonSnapshots(env);
      }
    })());
  },
};
