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
  routing_plan_id?: string | null;
  routing_item_id?: string | null;
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
      routing_plan_id TEXT,
      routing_item_id TEXT,
      message TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ticket_stats_events_lookup
      ON ticket_stats_events(service, country, operator, provider, occurred_at);
  `);
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
        outcome, status, occurred_at, routing_plan_id, routing_item_id, message
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
      event.routing_plan_id ?? null,
      event.routing_item_id ?? null,
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
    latest_ticket_events AS (
      SELECT *
      FROM (
        SELECT
          filtered_events.*,
          ROW_NUMBER() OVER (
            PARTITION BY ticket_id
            ORDER BY occurred_at DESC, id DESC
          ) AS row_number
        FROM filtered_events
      )
      WHERE row_number = 1
    )
    SELECT
      provider,
      service,
      country,
      COALESCE(operator, 'any') AS operator,
      COUNT(*) AS total,
      SUM(CASE WHEN outcome IN ('code_received', 'finished') THEN 1 ELSE 0 END) AS success_count,
      SUM(CASE WHEN outcome = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_count,
      SUM(CASE WHEN outcome = 'banned' THEN 1 ELSE 0 END) AS banned_count,
      SUM(CASE WHEN outcome = 'failed' THEN 1 ELSE 0 END) AS failed_count
    FROM latest_ticket_events
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
