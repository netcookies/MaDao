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
