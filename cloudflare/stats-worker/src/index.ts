type Env = {
  DB: D1Database;
  API_TOKEN: string;
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

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  });
}

function html(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

async function renderDashboard(env: Env) {
  await ensureSchema(env);

  const usersResult = await env.DB.prepare(`
    SELECT COUNT(DISTINCT app_instance_id) as total_users,
           COUNT(DISTINCT CASE WHEN occurred_at > datetime('now', '-24 hours') THEN app_instance_id END) as active_24h,
           COUNT(DISTINCT CASE WHEN occurred_at > datetime('now', '-7 days') THEN app_instance_id END) as active_7d
    FROM ticket_stats_events
  `).first<{ total_users: number; active_24h: number; active_7d: number }>();

  const eventsResult = await env.DB.prepare(`
    SELECT COUNT(*) as total_events,
           COUNT(DISTINCT ticket_id) as total_tickets,
           MIN(occurred_at) as first_event,
           MAX(occurred_at) as last_event
    FROM ticket_stats_events
  `).first<{ total_events: number; total_tickets: number; first_event: string | null; last_event: string | null }>();

  const topProviders = await env.DB.prepare(`
    SELECT provider, COUNT(DISTINCT ticket_id) as tickets, COUNT(DISTINCT app_instance_id) as users
    FROM ticket_stats_events
    WHERE occurred_at > datetime('now', '-7 days')
    GROUP BY provider ORDER BY tickets DESC LIMIT 5
  `).all<{ provider: string; tickets: number; users: number }>();

  const topServices = await env.DB.prepare(`
    SELECT service, COUNT(DISTINCT ticket_id) as tickets
    FROM ticket_stats_events
    WHERE occurred_at > datetime('now', '-7 days')
    GROUP BY service ORDER BY tickets DESC LIMIT 5
  `).all<{ service: string; tickets: number }>();

  const recentUsers = await env.DB.prepare(`
    SELECT app_instance_id, app_version, MAX(occurred_at) as last_seen, COUNT(*) as event_count
    FROM ticket_stats_events
    GROUP BY app_instance_id
    ORDER BY last_seen DESC LIMIT 10
  `).all<{ app_instance_id: string; app_version: string; last_seen: string; event_count: number }>();

  const totalUsers = usersResult?.total_users ?? 0;
  const active24h = usersResult?.active_24h ?? 0;
  const active7d = usersResult?.active_7d ?? 0;
  const totalEvents = eventsResult?.total_events ?? 0;
  const totalTickets = eventsResult?.total_tickets ?? 0;
  const firstEvent = eventsResult?.first_event ?? '-';
  const lastEvent = eventsResult?.last_event ?? '-';

  const providerRows = (topProviders.results ?? [])
    .map((r) => `<tr><td>${esc(r.provider)}</td><td>${r.tickets}</td><td>${r.users}</td></tr>`)
    .join('');

  const serviceRows = (topServices.results ?? [])
    .map((r) => `<tr><td>${esc(r.service)}</td><td>${r.tickets}</td></tr>`)
    .join('');

  const userRows = (recentUsers.results ?? [])
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
  <div class="card"><div class="label">Total Users</div><div class="value">${totalUsers}</div><div class="sub">All time</div></div>
  <div class="card"><div class="label">Active (24h)</div><div class="value">${active24h}</div></div>
  <div class="card"><div class="label">Active (7d)</div><div class="value">${active7d}</div></div>
  <div class="card"><div class="label">Total Events</div><div class="value">${totalEvents}</div></div>
  <div class="card"><div class="label">Total Tickets</div><div class="value">${totalTickets}</div></div>
</div>
<p class="muted" style="margin-bottom:24px;font-size:12px">First event: ${esc(firstEvent)} · Last event: ${esc(lastEvent)}</p>

<h2>Top Providers (7d)</h2>
<table><thead><tr><th>Provider</th><th>Tickets</th><th>Users</th></tr></thead><tbody>${providerRows || '<tr><td colspan="3" class="muted">No data</td></tr>'}</tbody></table>

<h2>Top Services (7d)</h2>
<table><thead><tr><th>Service</th><th>Tickets</th></tr></thead><tbody>${serviceRows || '<tr><td colspan="2" class="muted">No data</td></tr>'}</tbody></table>

<h2>Recent Users</h2>
<table><thead><tr><th>Instance</th><th>Version</th><th>Last Seen</th><th>Events</th></tr></thead><tbody>${userRows || '<tr><td colspan="4" class="muted">No data</td></tr>'}</tbody></table>
</body>
</html>`);
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function isAuthorized(request: Request, env: Env) {
  const header = request.headers.get('authorization') ?? '';
  return header === `Bearer ${env.API_TOKEN}`;
}

async function ensureSchema(env: Env) {
  await env.DB.exec(`
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
    );
    CREATE INDEX IF NOT EXISTS idx_ticket_stats_events_lookup
      ON ticket_stats_events(service, country, operator, provider, occurred_at);
  `);
  // Migrate existing tables that lack new columns
  await env.DB.exec(`ALTER TABLE ticket_stats_events ADD COLUMN price REAL;`).catch(() => {});
  await env.DB.exec(`ALTER TABLE ticket_stats_events ADD COLUMN receive_duration_secs REAL;`).catch(() => {});
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

async function querySummary(request: Request, env: Env) {
  await ensureSchema(env);
  const url = new URL(request.url);
  const query: StatsQuery = {
    service: url.searchParams.get('service'),
    country: url.searchParams.get('country'),
    operator: url.searchParams.get('operator'),
    provider: url.searchParams.get('provider'),
    lookback_hours: Number(url.searchParams.get('lookback_hours') ?? '24'),
  };
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
      query.service, query.service,
      query.country, query.country,
      query.operator, query.operator,
      query.provider, query.provider,
    )
    .all();

  const items = (rows.results ?? []).map((row) => {
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

  return json({
    lookback_hours: lookbackHours,
    items,
  });
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/') {
      return renderDashboard(env);
    }
    if (request.method === 'POST' && url.pathname === '/v1/events') {
      return uploadEvents(request, env);
    }
    if (request.method === 'GET' && url.pathname === '/v1/summary') {
      return querySummary(request, env);
    }
    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ status: 'ok' });
    }
    return json({ message: 'not found' }, 404);
  },
};
