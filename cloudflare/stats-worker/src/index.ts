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

type DashboardLanguage = 'en' | 'zh';

type DashboardQuery = {
  lookbackHours: number;
  service: string | null;
  language: DashboardLanguage;
};

type DashboardServiceOption = {
  service: string;
  label: string;
  total: number;
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

function buildDashboardQuery(request: Request): DashboardQuery {
  const url = new URL(request.url);
  const requestedLookback = Number(url.searchParams.get('lookback_hours') ?? '24');
  const lookbackHours = PRECOMPUTED_SUMMARY_LOOKBACK_HOURS.includes(requestedLookback as typeof PRECOMPUTED_SUMMARY_LOOKBACK_HOURS[number])
    ? requestedLookback
    : 24;
  const rawService = url.searchParams.get('service')?.trim() ?? '';
  const rawLanguage = url.searchParams.get('lang')?.trim().toLowerCase();
  return {
    lookbackHours,
    service: rawService && rawService.toLowerCase() !== 'all' ? rawService : null,
    language: rawLanguage === 'zh' ? 'zh' : 'en',
  };
}

function dashboardCacheKeyFor(request: Request, lookbackHours: number, service: string | null, language: DashboardLanguage) {
  const url = new URL(request.url);
  url.pathname = '/';
  url.hash = '';
  url.search = '';
  url.searchParams.set('lookback_hours', String(lookbackHours));
  url.searchParams.set('lang', language);
  if (service) url.searchParams.set('service', service);
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
  const query = buildDashboardQuery(request);
  const shouldUseHtmlCache = query.service == null;
  const cacheKey = dashboardCacheKeyFor(request, query.lookbackHours, null, query.language);
  if (shouldUseHtmlCache) {
    const cached = await defaultCache().match(cacheKey);
    if (cached) return cached;
  }

  const snapshot = await getDashboardSnapshot(env);
  const summary = await loadSummarySnapshot(env, query.lookbackHours);
  const response = renderDashboardSnapshot(snapshot, summary, query);
  if (shouldUseHtmlCache) {
    ctx.waitUntil(defaultCache().put(cacheKey, response.clone()));
  }
  return response;
}

async function refreshDashboard(request: Request, env: Env) {
  if (!isAuthorized(request, env)) {
    return json({ message: 'unauthorized' }, 401);
  }
  await refreshCommonSnapshots(env);
  const snapshot = await getDashboardSnapshot(env);
  await Promise.all(PRECOMPUTED_SUMMARY_LOOKBACK_HOURS.flatMap((lookbackHours) =>
    (['en', 'zh'] as const).map((language) =>
      defaultCache().delete(dashboardCacheKeyFor(request, lookbackHours, null, language))
    )
  ));
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

const DASHBOARD_I18N: Record<DashboardLanguage, Record<string, string>> = {
  en: {
    all_countries: 'All countries',
    all_services: 'All services',
    any_operator: 'Any operator',
    attempts_count: '{count} attempts',
    best_routes: 'Best Routes',
    cheapest_routes: 'Cheapest Routes',
    choose_service: 'Choose Service',
    choose_service_subtitle: 'Switch the route ranking service.',
    close: 'Close',
    fastest_routes: 'Fastest Routes',
    language: 'Language',
    local_country: 'Local',
    lookback_period: 'Lookback period',
    more_services: 'More Services',
    no_route_data: 'No route data yet',
    no_services_yet: 'No services yet',
    page_title: 'Stats Dashboard',
    pending: 'pending',
    routes_pending: 'Routes pending',
    service_status: 'Service status',
    service_status_aria: 'Service status {status}',
    snapshot_ready: 'Snapshot ready',
    source_users: 'Source users',
    source_users_aria: 'Source users {count}',
    users_chip: '{count} users',
    subtitle: 'Shared route quality telemetry for MaDao clients. Refreshed {refreshed}. {summary}. {totals}.',
    summary_pending: '24h route snapshot is not ready',
    summary_ready: '{hours}h route snapshot',
    theme: 'Theme',
    theme_auto: 'Auto',
    theme_dark: 'Dark',
    theme_light: 'Light',
    totals_note: '{users} users, {tickets} tickets, {events} events in 7d',
  },
  zh: {
    all_countries: '全部国家',
    all_services: '全部服务',
    any_operator: '任意线路',
    attempts_count: '{count} 次尝试',
    best_routes: '最佳路线',
    cheapest_routes: '最低成本路线',
    choose_service: '选择服务',
    choose_service_subtitle: '切换路线排名使用的服务。',
    close: '关闭',
    fastest_routes: '最快路线',
    language: '语言',
    local_country: '本地',
    lookback_period: '统计周期',
    more_services: '更多服务',
    no_route_data: '暂无路线数据',
    no_services_yet: '暂无服务',
    page_title: '统计仪表盘',
    pending: '待生成',
    routes_pending: '路线待生成',
    service_status: '服务状态',
    service_status_aria: '服务状态 {status}',
    snapshot_ready: '快照已就绪',
    source_users: '数据用户',
    source_users_aria: '数据来源用户 {count}',
    users_chip: '{count} 用户',
    subtitle: 'MaDao 客户端共享路线质量统计。刷新于 {refreshed}。{summary}。{totals}。',
    summary_pending: '24h 路线快照尚未就绪',
    summary_ready: '{hours}h 路线快照',
    theme: '主题',
    theme_auto: '自动',
    theme_dark: '深色',
    theme_light: '浅色',
    totals_note: '7 天内 {users} 个用户，{tickets} 个 ticket，{events} 条事件',
  },
};

function t(language: DashboardLanguage, key: string, values: Record<string, string> = {}) {
  let template = DASHBOARD_I18N[language][key] ?? DASHBOARD_I18N.en[key] ?? key;
  for (const [name, value] of Object.entries(values)) {
    template = template.replaceAll(`{${name}}`, value);
  }
  return template;
}

function renderDashboardSnapshot(snapshot: DashboardSnapshot, summary: SummaryResponse | null, query: DashboardQuery) {
  const { totals } = snapshot;
  const summaryItems = summary?.items ?? [];
  const language = query.language;
  const serviceOptions = buildDashboardServiceOptions(summaryItems);
  const selectedServiceOption = query.service
    ? serviceOptions.find((option) => normalizeToken(option.service) === normalizeToken(query.service ?? '')) ?? null
    : null;
  const selectedService = selectedServiceOption?.service ?? null;
  const selectedServiceLabel = selectedServiceOption?.label ?? t(language, 'all_services');
  const visibleItems = selectedService
    ? summaryItems.filter((item) => normalizeToken(item.service) === normalizeToken(selectedService))
    : summaryItems;
  const routeSnapshotLabel = summary ? `${lookbackLabel(summary.lookback_hours)} · ${selectedServiceLabel}` : `${lookbackLabel(query.lookbackHours)} ${t(language, 'pending')}`;
  const bestRoutes = [...visibleItems]
    .sort((a, b) => b.success_rate - a.success_rate || b.total - a.total)
    .slice(0, 5);
  const cheapestRoutes = [...visibleItems]
    .filter((item) => item.avg_effective_price != null)
    .sort((a, b) => a.avg_effective_price! - b.avg_effective_price! || b.success_rate - a.success_rate)
    .slice(0, 5);
  const fastestRoutes = [...visibleItems]
    .filter((item) => item.avg_receive_time_secs != null)
    .sort((a, b) => a.avg_receive_time_secs! - b.avg_receive_time_secs! || b.success_rate - a.success_rate)
    .slice(0, 5);
  const totalsNote = t(language, 'totals_note', {
    users: formatCount(totals.total_users),
    tickets: formatCount(totals.total_tickets),
    events: formatCount(totals.total_events),
  });
  const summaryNote = summary
    ? t(language, 'summary_ready', { hours: String(summary.lookback_hours) })
    : t(language, 'summary_pending');
  const statusLabel = summary ? t(language, 'snapshot_ready') : t(language, 'routes_pending');
  const serviceStatusClass = summary ? 'info-chip status-chip' : 'info-chip status-chip pending';

  return html(`<!DOCTYPE html>
<html lang="${language === 'zh' ? 'zh-CN' : 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(t(language, 'page_title'))}</title>
<script>
(() => {
  try {
    const theme = localStorage.getItem('madao-stats-dashboard-theme');
    if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
    const params = new URLSearchParams(location.search);
    const language = params.get('lang') || localStorage.getItem('madao-stats-dashboard-lang');
    if (!params.has('lang') && (language === 'en' || language === 'zh')) {
      params.set('lang', language);
      location.replace(location.pathname + '?' + params.toString());
    }
  } catch {}
})();
</script>
<style>
:root{
  color-scheme:light dark;
  --page-bg:#e8ecf0;
  --surface:rgba(255,255,255,.70);
  --surface-subtle:rgba(255,255,255,.45);
  --border:rgba(0,0,0,.08);
  --text:#1d1d1f;
  --muted:#6e6e73;
  --accent:#007aff;
  --accent-soft:rgba(0,122,255,.10);
  --success:#27c93f;
  --danger:#ff5f57;
  --shadow:0 2px 8px rgba(0,0,0,.06);
  --card-shadow:0 2px 2px rgba(0,0,0,.06);
  --hover-subtle:rgba(0,122,255,.07);
  --overlay-bg:rgba(232,236,240,.42);
  --modal-bg:rgba(255,255,255,.92);
  --modal-shadow:0 8px 40px rgba(0,0,0,.14),0 0 0 .5px rgba(255,255,255,.5);
  --text-soft:rgba(29,29,31,.72);
  --text-faint:rgba(29,29,31,.52);
  --text-subtle:rgba(29,29,31,.45);
  --rank-text:rgba(29,29,31,.30);
}
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]){
    color-scheme:dark;
    --page-bg:#1a1a1c;
    --surface:rgba(44,44,48,.80);
    --surface-subtle:rgba(52,52,56,.58);
    --border:rgba(255,255,255,.10);
    --text:#f5f5f7;
    --muted:#a1a1a6;
    --accent:#0a84ff;
    --accent-soft:rgba(10,132,255,.16);
    --success:#30d158;
    --danger:#ff453a;
    --shadow:0 2px 10px rgba(0,0,0,.22);
    --card-shadow:0 2px 8px rgba(0,0,0,.18);
    --hover-subtle:rgba(10,132,255,.13);
    --overlay-bg:rgba(26,26,28,.50);
    --modal-bg:rgba(52,52,56,.92);
    --modal-shadow:0 8px 40px rgba(0,0,0,.34),0 0 0 .5px rgba(255,255,255,.12);
    --text-soft:rgba(245,245,247,.76);
    --text-faint:rgba(245,245,247,.56);
    --text-subtle:rgba(245,245,247,.44);
    --rank-text:rgba(245,245,247,.30);
  }
}
:root[data-theme="light"]{color-scheme:light}
:root[data-theme="dark"]{
  color-scheme:dark;
  --page-bg:#1a1a1c;
  --surface:rgba(44,44,48,.80);
  --surface-subtle:rgba(52,52,56,.58);
  --border:rgba(255,255,255,.10);
  --text:#f5f5f7;
  --muted:#a1a1a6;
  --accent:#0a84ff;
  --accent-soft:rgba(10,132,255,.16);
  --success:#30d158;
  --danger:#ff453a;
  --shadow:0 2px 10px rgba(0,0,0,.22);
  --card-shadow:0 2px 8px rgba(0,0,0,.18);
  --hover-subtle:rgba(10,132,255,.13);
  --overlay-bg:rgba(26,26,28,.50);
  --modal-bg:rgba(52,52,56,.92);
  --modal-shadow:0 8px 40px rgba(0,0,0,.34),0 0 0 .5px rgba(255,255,255,.12);
  --text-soft:rgba(245,245,247,.76);
  --text-faint:rgba(245,245,247,.56);
  --text-subtle:rgba(245,245,247,.44);
  --rank-text:rgba(245,245,247,.30);
}
*{margin:0;padding:0;box-sizing:border-box}
body{
  min-height:100vh;
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",Roboto,sans-serif;
  background:var(--page-bg);
  color:var(--text);
  padding:40px 28px 56px;
}
.content{width:min(1160px,100%);margin:0 auto}
.hero{
  display:grid;
  grid-template-columns:minmax(0,1fr) auto;
  align-items:flex-start;
  justify-content:space-between;
  gap:20px;
  margin-bottom:24px;
}
h1{font-size:28px;line-height:1.12;font-weight:650;letter-spacing:0}
.subtitle{margin-top:8px;font-size:13px;line-height:1.45;color:var(--muted)}
.hero-actions{
  display:flex;
  align-items:center;
  justify-content:flex-end;
  gap:8px;
  flex-wrap:wrap;
  max-width:660px;
}
.info-chip{
  display:inline-flex;
  align-items:center;
  gap:8px;
  min-height:34px;
  border:1px solid var(--border);
  border-radius:999px;
  background:var(--surface);
  padding:8px 12px;
  font-size:12px;
  font-weight:650;
  color:var(--muted);
  box-shadow:var(--shadow);
  -webkit-backdrop-filter:blur(20px);
  backdrop-filter:blur(20px);
  white-space:nowrap;
}
.info-chip strong{font-size:13px;color:var(--text)}
.status-chip.pending .status-dot{background:var(--danger);box-shadow:0 0 0 4px rgba(255,95,87,.12)}
.status-dot,.source-dot{width:8px;height:8px;border-radius:50%;background:var(--success);box-shadow:0 0 0 4px rgba(39,201,63,.12)}
.toolbar{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  margin-bottom:24px;
}
.toolbar-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;min-width:0}
.lookback-segment,.theme-segment,.language-segment{
  display:inline-flex;
  align-items:center;
  border:1px solid var(--border);
  border-radius:8px;
  background:var(--surface-subtle);
  padding:2px;
  -webkit-backdrop-filter:blur(12px);
  backdrop-filter:blur(12px);
}
.segment-link,.theme-button,.language-link{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  min-width:42px;
  height:26px;
  border-radius:6px;
  color:var(--text-faint);
  font-size:12px;
  font-weight:650;
  text-decoration:none;
}
.theme-button{
  border:0;
  background:transparent;
  cursor:pointer;
  font-family:inherit;
  font-size:12px;
  font-weight:650;
  padding:0 8px;
}
.language-link{text-decoration:none}
.segment-link.active,.theme-button.active,.language-link.active{
  background:var(--surface);
  color:var(--text);
  box-shadow:0 1px 2px rgba(0,0,0,.08);
}
.control-button{
  min-height:32px;
  border:1px solid var(--border);
  border-radius:8px;
  background:var(--surface);
  color:var(--text-soft);
  padding:0 11px;
  font:inherit;
  font-size:12px;
  font-weight:650;
  box-shadow:var(--card-shadow);
  cursor:pointer;
  -webkit-backdrop-filter:blur(20px);
  backdrop-filter:blur(20px);
}
.control-button:hover{border-color:var(--text-subtle);color:var(--text)}
.selected-service{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:650;color:var(--text-faint)}
.route-card{
  border:1px solid var(--border);
  border-radius:8px;
  background:var(--surface);
  box-shadow:var(--card-shadow);
  -webkit-backdrop-filter:blur(20px);
  backdrop-filter:blur(20px);
}
.routes-stack{display:flex;flex-direction:column;gap:24px}
.route-section{display:flex;flex-direction:column;gap:12px}
.section-header{
  display:flex;
  align-items:baseline;
  justify-content:space-between;
  gap:12px;
}
h2{font-size:13px;font-weight:650;color:var(--text-soft)}
.section-note{font-size:12px;color:var(--text-subtle)}
.route-grid{display:grid;grid-template-columns:repeat(5,minmax(150px,1fr));gap:10px}
.route-card{min-height:120px;display:grid;grid-template-rows:auto 1fr auto;gap:12px;padding:12px}
.route-top,.route-bottom{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;min-width:0}
.route-bottom{align-items:flex-end}
.provider{display:flex;min-width:0;flex:1 1 auto;align-items:center;gap:6px;color:var(--text)}
.provider-icon{
  display:inline-grid;
  place-items:center;
  width:20px;
  height:20px;
  border:1px solid var(--border);
  border-radius:5px;
  background:var(--surface-subtle);
  color:var(--text);
  font-size:10px;
  font-weight:760;
  line-height:1;
  flex:0 0 auto;
  box-shadow:0 1px 2px rgba(0,0,0,.05);
}
.provider-icon svg{width:100%;height:100%;display:block}
.provider-icon-fivesim{background:#fff;color:#1f6feb}
.provider-icon-herosms{background:rgba(249,115,22,.12);color:#ea580c}
.provider-icon-smsbower{background:#fff;color:#0f766e}
.provider-meta{min-width:0;display:flex;flex-direction:column;gap:2px}
.provider-text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;font-weight:650;line-height:1.1}
.service-text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px;font-weight:550;line-height:1.1;color:var(--muted)}
.route-label{max-width:46%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right;font-size:10px;font-weight:550;line-height:1.2;color:var(--text-faint)}
.main-value{display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:750;line-height:1;color:var(--success);letter-spacing:0}
.main-value.accent{color:var(--accent)}
.country{display:flex;min-width:0;align-items:center;gap:6px;color:var(--text)}
.flag{font-size:16px;line-height:1;filter:saturate(1.08)}
.country-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;font-weight:650}
.rank{font-size:10px;font-weight:650;color:var(--rank-text)}
.empty-routes{min-height:120px;border:1px solid var(--border);border-radius:8px;background:var(--surface);padding:18px;color:var(--muted);font-size:13px;box-shadow:var(--card-shadow);-webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px)}
.modal-overlay[hidden]{display:none}
.modal-overlay{
  position:fixed;
  inset:0;
  display:grid;
  place-items:center;
  padding:20px;
  background:var(--overlay-bg);
  -webkit-backdrop-filter:blur(14px);
  backdrop-filter:blur(14px);
  z-index:10;
}
.modal{
  width:min(420px,100%);
  max-height:min(560px,calc(100vh - 40px));
  display:flex;
  flex-direction:column;
  overflow:hidden;
  border:1px solid var(--border);
  border-radius:12px;
  background:var(--modal-bg);
  box-shadow:var(--modal-shadow);
  -webkit-backdrop-filter:blur(20px);
  backdrop-filter:blur(20px);
}
.modal-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:16px 18px 12px}
.modal-title{font-size:15px;font-weight:700;color:var(--text)}
.modal-subtitle{margin-top:3px;font-size:12px;color:var(--muted)}
.modal-close{
  display:inline-grid;
  place-items:center;
  width:28px;
  height:28px;
  border:1px solid var(--border);
  border-radius:8px;
  background:var(--surface-subtle);
  color:var(--muted);
  cursor:pointer;
}
.service-list{overflow:auto;padding:4px 0 12px}
.service-option{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  min-height:42px;
  padding:8px 18px;
  color:var(--text);
  text-decoration:none;
  border-left:2px solid transparent;
}
.service-option:hover{background:var(--hover-subtle)}
.service-option.selected{border-left-color:var(--accent);background:var(--accent-soft)}
.service-left{display:flex;align-items:center;gap:9px;min-width:0}
.service-glyph{
  display:inline-grid;
  place-items:center;
  width:24px;
  height:24px;
  border:1px solid var(--border);
  border-radius:7px;
  background:var(--surface-subtle);
  color:var(--accent);
  font-size:10px;
  font-weight:800;
  box-shadow:0 1px 2px rgba(0,0,0,.05);
}
.service-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:650}
.service-count{flex:0 0 auto;font-size:11px;color:var(--muted)}
@media (max-width:1080px){
  body{padding:28px 24px 44px}
  .hero{grid-template-columns:1fr}
  .hero-actions{justify-content:flex-start;max-width:none}
  .route-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media (max-width:640px){
  body{padding:24px 16px 40px}
  h1{font-size:24px}
  .info-chip{align-self:flex-start}
  .toolbar{align-items:stretch;flex-direction:column}
  .toolbar-actions{justify-content:flex-end;flex-wrap:wrap}
  .lookback-segment{flex:1 1 150px}
  .segment-link{flex:1}
  .theme-segment{flex:1 1 180px}
  .theme-button{flex:1}
  .language-segment{flex:0 0 auto}
  .language-link{flex:1}
  .route-grid{grid-template-columns:1fr}
}
</style>
</head>
<body>
<main class="content">
  <header class="hero">
    <div>
      <h1>${esc(t(language, 'page_title'))}</h1>
      <p class="subtitle">${esc(t(language, 'subtitle', {
        refreshed: formatDateTime(snapshot.refreshed_at, language),
        summary: summaryNote,
        totals: totalsNote,
      }))}</p>
    </div>
    <div class="hero-actions">
      <div class="${serviceStatusClass}" title="${esc(t(language, 'service_status_aria', { status: statusLabel }))}" aria-label="${esc(t(language, 'service_status_aria', { status: statusLabel }))}"><span class="status-dot"></span><strong>${esc(statusLabel)}</strong></div>
      <div class="info-chip source-chip" title="${esc(t(language, 'source_users_aria', { count: formatCount(totals.total_users) }))}" aria-label="${esc(t(language, 'source_users_aria', { count: formatCount(totals.total_users) }))}"><span class="source-dot"></span><strong>${esc(t(language, 'users_chip', { count: formatCount(totals.total_users) }))}</strong></div>
      ${renderThemeSegment(language)}
      ${renderLanguageSegment(query)}
    </div>
  </header>

  <div class="toolbar">
    <div class="selected-service">${esc(selectedServiceLabel)}</div>
    <div class="toolbar-actions">
      ${renderLookbackSegment(query.lookbackHours, selectedService, language)}
      <button class="control-button" type="button" data-open-service-modal aria-haspopup="dialog" aria-controls="service-modal">${esc(t(language, 'more_services'))}</button>
    </div>
  </div>

  <div class="routes-stack">
    ${renderRouteSection(t(language, 'best_routes'), routeSnapshotLabel, bestRoutes, (item) => `${(item.success_rate * 100).toFixed(1)}%`, 'success', language)}
    ${renderRouteSection(t(language, 'cheapest_routes'), routeSnapshotLabel, cheapestRoutes, (item) => formatCurrency(item.avg_effective_price, language), 'accent', language)}
    ${renderRouteSection(t(language, 'fastest_routes'), routeSnapshotLabel, fastestRoutes, (item) => formatDuration(item.avg_receive_time_secs), 'accent', language)}
  </div>

  ${renderServiceModal(serviceOptions, selectedService, query.lookbackHours, language)}
</main>
<script>
(() => {
  const themeKey = 'madao-stats-dashboard-theme';
  const languageKey = 'madao-stats-dashboard-lang';
  const root = document.documentElement;
  const themeButtons = document.querySelectorAll('[data-theme-choice]');
  const languageLinks = document.querySelectorAll('[data-language-choice]');
  const applyTheme = (theme) => {
    if (theme === 'light' || theme === 'dark') {
      root.dataset.theme = theme;
      localStorage.setItem(themeKey, theme);
    } else {
      root.removeAttribute('data-theme');
      localStorage.setItem(themeKey, 'auto');
      theme = 'auto';
    }
    themeButtons.forEach((button) => {
      const active = button.getAttribute('data-theme-choice') === theme;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  };
  applyTheme(localStorage.getItem(themeKey) || 'auto');
  themeButtons.forEach((button) => {
    button.addEventListener('click', () => applyTheme(button.getAttribute('data-theme-choice') || 'auto'));
  });
  const activeLanguage = new URLSearchParams(location.search).get('lang') || '${language}';
  if (activeLanguage === 'en' || activeLanguage === 'zh') localStorage.setItem(languageKey, activeLanguage);
  languageLinks.forEach((link) => {
    link.addEventListener('click', () => {
      const language = link.getAttribute('data-language-choice');
      if (language === 'en' || language === 'zh') localStorage.setItem(languageKey, language);
    });
  });

  const modal = document.querySelector('[data-service-modal]');
  const openButton = document.querySelector('[data-open-service-modal]');
  const closeButtons = document.querySelectorAll('[data-close-service-modal]');
  if (!modal || !openButton) return;
  const open = () => {
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    modal.querySelector('[data-close-service-modal]')?.focus();
  };
  const close = () => {
    modal.hidden = true;
    document.body.style.overflow = '';
    openButton.focus();
  };
  openButton.addEventListener('click', open);
  closeButtons.forEach((button) => button.addEventListener('click', close));
  modal.addEventListener('click', (event) => {
    if (event.target === modal) close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.hidden) close();
  });
})();
</script>
</body>
</html>`, 200, {
    'cache-control': `max-age=${DASHBOARD_CACHE_TTL_SECONDS}`,
  });
}

function buildDashboardServiceOptions(items: SummaryItem[]): DashboardServiceOption[] {
  const byService = new Map<string, DashboardServiceOption>();
  for (const item of items) {
    const key = normalizeToken(item.service);
    const existing = byService.get(key) ?? {
      service: item.service,
      label: formatServiceLabel(item.service),
      total: 0,
    };
    existing.total += item.total;
    byService.set(key, existing);
  }
  return [...byService.values()].sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

function renderLookbackSegment(activeLookback: number, service: string | null, language: DashboardLanguage) {
  return `
      <div class="lookback-segment" role="group" aria-label="${esc(t(language, 'lookback_period'))}">
        ${renderLookbackLink(24, activeLookback, service, language)}
        ${renderLookbackLink(72, activeLookback, service, language)}
        ${renderLookbackLink(168, activeLookback, service, language)}
      </div>`;
}

function renderLookbackLink(lookbackHours: number, activeLookback: number, service: string | null, language: DashboardLanguage) {
  const activeClass = lookbackHours === activeLookback ? ' active' : '';
  return `<a class="segment-link${activeClass}" href="${esc(dashboardHref(lookbackHours, service, language))}">${esc(lookbackLabel(lookbackHours))}</a>`;
}

function renderThemeSegment(language: DashboardLanguage) {
  return `
      <div class="theme-segment" role="group" aria-label="${esc(t(language, 'theme'))}">
        <button class="theme-button active" type="button" data-theme-choice="auto" aria-pressed="true">${esc(t(language, 'theme_auto'))}</button>
        <button class="theme-button" type="button" data-theme-choice="light" aria-pressed="false">${esc(t(language, 'theme_light'))}</button>
        <button class="theme-button" type="button" data-theme-choice="dark" aria-pressed="false">${esc(t(language, 'theme_dark'))}</button>
      </div>`;
}

function renderLanguageSegment(query: DashboardQuery) {
  return `
      <div class="language-segment" role="group" aria-label="${esc(t(query.language, 'language'))}">
        ${renderLanguageLink('en', query)}
        ${renderLanguageLink('zh', query)}
      </div>`;
}

function renderLanguageLink(language: DashboardLanguage, query: DashboardQuery) {
  const activeClass = language === query.language ? ' active' : '';
  const label = language === 'zh' ? '中文' : 'EN';
  return `<a class="language-link${activeClass}" data-language-choice="${language}" href="${esc(dashboardHref(query.lookbackHours, query.service, language))}">${label}</a>`;
}

function renderServiceModal(options: DashboardServiceOption[], selectedService: string | null, lookbackHours: number, language: DashboardLanguage) {
  const allSelected = selectedService == null;
  const serviceRows = options
    .map((option) => renderServiceOption(option, selectedService, lookbackHours, language))
    .join('');
  const totalAttempts = formatCount(options.reduce((sum, option) => sum + option.total, 0));
  return `
  <div class="modal-overlay" data-service-modal id="service-modal" hidden>
    <section class="modal" role="dialog" aria-modal="true" aria-labelledby="service-modal-title">
      <div class="modal-header">
        <div>
          <div class="modal-title" id="service-modal-title">${esc(t(language, 'choose_service'))}</div>
          <div class="modal-subtitle">${esc(t(language, 'choose_service_subtitle'))}</div>
        </div>
        <button class="modal-close" type="button" data-close-service-modal aria-label="${esc(t(language, 'close'))}">x</button>
      </div>
      <div class="service-list">
        <a class="service-option${allSelected ? ' selected' : ''}" href="${esc(dashboardHref(lookbackHours, null, language))}">
          <span class="service-left"><span class="service-glyph">ALL</span><span class="service-name">${esc(t(language, 'all_services'))}</span></span>
          <span class="service-count">${esc(t(language, 'attempts_count', { count: totalAttempts }))}</span>
        </a>
        ${serviceRows || `<div class="service-option"><span class="service-left"><span class="service-glyph">--</span><span class="service-name">${esc(t(language, 'no_services_yet'))}</span></span></div>`}
      </div>
    </section>
  </div>`;
}

function renderServiceOption(option: DashboardServiceOption, selectedService: string | null, lookbackHours: number, language: DashboardLanguage) {
  const selected = selectedService != null && normalizeToken(option.service) === normalizeToken(selectedService);
  return `
        <a class="service-option${selected ? ' selected' : ''}" href="${esc(dashboardHref(lookbackHours, option.service, language))}">
          <span class="service-left"><span class="service-glyph">${initials(option.service)}</span><span class="service-name">${esc(option.label)}</span></span>
          <span class="service-count">${esc(t(language, 'attempts_count', { count: formatCount(option.total) }))}</span>
        </a>`;
}

function dashboardHref(lookbackHours: number, service: string | null, language: DashboardLanguage) {
  const params = new URLSearchParams();
  params.set('lookback_hours', String(lookbackHours));
  params.set('lang', language);
  if (service) params.set('service', service);
  return `/?${params.toString()}`;
}

function lookbackLabel(lookbackHours: number) {
  if (lookbackHours === 24) return '24h';
  if (lookbackHours === 72) return '3d';
  if (lookbackHours === 168) return '7d';
  return `${lookbackHours}h`;
}

function renderRouteSection(
  title: string,
  note: string,
  items: SummaryItem[],
  value: (item: SummaryItem) => string,
  tone: 'success' | 'accent',
  language: DashboardLanguage,
) {
  const cards = items
    .map((item, index) => renderRouteCard(item, index + 1, value(item), tone, language))
    .join('');
  return `
  <section class="route-section">
    <div class="section-header"><h2>${esc(title)}</h2><span class="section-note">${esc(note)}</span></div>
    ${cards ? `<div class="route-grid">${cards}</div>` : `<div class="empty-routes">${esc(t(language, 'no_route_data'))}</div>`}
  </section>`;
}

function renderRouteCard(item: SummaryItem, rank: number, value: string, tone: 'success' | 'accent', language: DashboardLanguage) {
  const operator = formatOperatorLabel(item.operator, language);
  return `
    <article class="route-card">
      <div class="route-top">
        <span class="provider">
          ${providerIcon(item.provider)}
          <span class="provider-meta">
            <span class="provider-text">${esc(formatProviderLabel(item.provider))}</span>
            <span class="service-text">${esc(formatServiceLabel(item.service))}</span>
          </span>
        </span>
        <span class="route-label">${esc(operator)}</span>
      </div>
      <div class="main-value ${tone === 'accent' ? 'accent' : ''}">${esc(value)}</div>
      <div class="route-bottom">
        <span class="country">
          <span class="flag">${countryFlag(item.country)}</span>
          <span class="country-name">${esc(formatCountryLabel(item.country, language))}</span>
        </span>
        <span class="rank">#${rank}</span>
      </div>
    </article>`;
}

function formatCount(value: number) {
  return new Intl.NumberFormat('en-US').format(Number(value ?? 0));
}

function formatDateTime(value: string, language: DashboardLanguage = 'en') {
  if (!value || value === '-') return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatCurrency(value: number | null, language: DashboardLanguage = 'zh') {
  if (value == null || !Number.isFinite(value)) return '-';
  return new Intl.NumberFormat(language === 'zh' ? 'zh-CN' : 'en-US', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDuration(value: number | null) {
  if (value == null || !Number.isFinite(value)) return '-';
  const seconds = Math.max(0, Math.round(value));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes < 60) return remainder > 0 ? `${minutes}m ${remainder}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const minuteRemainder = minutes % 60;
  return minuteRemainder > 0 ? `${hours}h ${minuteRemainder}m` : `${hours}h`;
}

function formatTokenLabel(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((part) => {
      if (!part) return part;
      if (part.length === 2 && /^[a-zA-Z]{2}$/.test(part)) return part.toUpperCase();
      return part[0]!.toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(' ');
}

function formatServiceLabel(value: string) {
  const normalized = normalizeToken(value);
  const labels: Record<string, string> = {
    apple: 'Apple',
    aol: 'AOL',
    claude: 'Claude',
    claudeai: 'Claude',
    discord: 'Discord',
    dr: 'OpenAI (GPT)',
    microsoft: 'Microsoft',
    openai: 'OpenAI (GPT)',
    paypal: 'PayPal',
    telegram: 'Telegram',
    tg: 'Telegram',
    twitter: 'Twitter/X',
    uber: 'Uber',
    wa: 'WhatsApp',
    wechat: 'WeChat',
    whatsapp: 'WhatsApp',
    yahoo: 'Yahoo',
  };
  return labels[normalized] ?? formatTokenLabel(value);
}

function formatProviderLabel(value: string) {
  const normalized = normalizeToken(value);
  const labels: Record<string, string> = {
    five_sim: 'FiveSim',
    fivesim: 'FiveSim',
    herosms: 'HeroSMS',
    mock: 'Mock',
    smsbower: 'SMSBower',
  };
  return labels[normalized] ?? formatTokenLabel(value);
}

function formatOperatorLabel(value: string, language: DashboardLanguage = 'en') {
  const normalized = normalizeToken(value);
  if (!normalized || normalized === '*' || normalized === 'any') return t(language, 'any_operator');
  return formatTokenLabel(value);
}

function normalizeToken(value: string) {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function canonicalCountryValue(country: string) {
  const normalized = country.trim().toLowerCase().replace(/[_/-]+/g, ' ').replace(/\s+/g, ' ');
  const aliases: Record<string, string> = {
    america: 'US',
    any: 'any',
    argentina: 'AR',
    austria: 'AT',
    britain: 'GB',
    canada: 'CA',
    china: 'CN',
    england: 'GB',
    germany: 'DE',
    japan: 'JP',
    local: 'local',
    russia: 'RU',
    'russian federation': 'RU',
    'south africa': 'ZA',
    uk: 'GB',
    'united kingdom': 'GB',
    'united states': 'US',
    unitedkingdom: 'GB',
    unitedstates: 'US',
    us: 'US',
    usa: 'US',
    vietnam: 'VN',
    'viet nam': 'VN',
  };
  if (!normalized) return '';
  if (aliases[normalized]) return aliases[normalized];
  if (/^[a-z]{2}$/.test(normalized)) return normalized.toUpperCase();
  return normalized;
}

function formatCountryLabel(country: string, language: DashboardLanguage = 'en') {
  const canonical = canonicalCountryValue(country);
  if (canonical === 'any') return t(language, 'all_countries');
  if (canonical === 'local') return t(language, 'local_country');
  if (/^[A-Z]{2}$/.test(canonical)) {
    try {
      return new Intl.DisplayNames([language === 'zh' ? 'zh-CN' : 'en'], { type: 'region' }).of(canonical) ?? canonical;
    } catch {
      return canonical;
    }
  }
  if (/^\d+$/.test(canonical)) return `Country ${canonical}`;
  return formatTokenLabel(country);
}

function providerIcon(provider: string) {
  const normalized = normalizeToken(provider);
  if (normalized === 'fivesim' || normalized === 'five_sim') {
    return `<span class="provider-icon provider-icon-fivesim" aria-hidden="true">${fiveSimIconSvg()}</span>`;
  }
  if (normalized === 'herosms') {
    return `<span class="provider-icon provider-icon-herosms" aria-hidden="true">${heroSmsIconSvg()}</span>`;
  }
  if (normalized === 'smsbower') {
    return `<span class="provider-icon provider-icon-smsbower" aria-hidden="true">${smsBowerIconSvg()}</span>`;
  }
  return `<span class="provider-icon" aria-hidden="true">${initials(provider)}</span>`;
}

function fiveSimIconSvg() {
  return '<svg viewBox="0 0 24 24" role="img"><rect x="3.5" y="4" width="17" height="16" rx="4" fill="currentColor" opacity=".14"/><path d="M8 7h8.2v2.2h-5.9l-.3 2h1.8c2.9 0 4.8 1.6 4.8 4 0 2.6-2.1 4.3-5.3 4.3-1.7 0-3.2-.4-4.3-1.1l.8-2.1c.9.6 2.1 1 3.3 1 1.5 0 2.5-.7 2.5-1.9 0-1.1-.8-1.8-2.8-1.8H7.2L8 7Z" fill="currentColor"/></svg>';
}

function heroSmsIconSvg() {
  return '<svg viewBox="0 0 24 24" role="img"><path d="M12 3.4 19 6v5.1c0 4.5-2.9 8.3-7 9.5-4.1-1.2-7-5-7-9.5V6l7-2.6Z" fill="currentColor" opacity=".18"/><path d="M7.8 8h2.5v3h3.4V8h2.5v8.6h-2.5v-3.4h-3.4v3.4H7.8V8Z" fill="currentColor"/></svg>';
}

function smsBowerIconSvg() {
  return '<svg viewBox="0 0 24 24" role="img"><rect x="4" y="5" width="16" height="14" rx="4" fill="currentColor" opacity=".14"/><path d="M7.5 8.5h5.6c1.8 0 2.9.9 2.9 2.3 0 .8-.4 1.5-1.1 1.9 1 .4 1.6 1.1 1.6 2.2 0 1.7-1.3 2.7-3.4 2.7H7.5V8.5Zm5.1 3.5c.7 0 1.1-.3 1.1-.8s-.4-.8-1.1-.8H10V12h2.6Zm.3 3.7c.8 0 1.3-.3 1.3-.9 0-.6-.5-.9-1.3-.9H10v1.8h2.9Z" fill="currentColor"/></svg>';
}

function countryFlag(country: string) {
  const canonical = canonicalCountryValue(country);
  if (/^[A-Z]{2}$/.test(canonical)) {
    const first = canonical.charCodeAt(0) - 65 + 0x1f1e6;
    const second = canonical.charCodeAt(1) - 65 + 0x1f1e6;
    return String.fromCodePoint(first, second);
  }
  if (canonical === 'any') return '*';
  if (canonical === 'local') return 'L';
  return esc(formatCountryLabel(country).slice(0, 1).toUpperCase() || '?');
}

function initials(value: string) {
  const label = formatTokenLabel(value);
  const parts = label.split(/\s+/).filter(Boolean);
  const text = parts.length >= 2
    ? `${parts[0]![0]}${parts[1]![0]}`
    : label.slice(0, 2);
  return esc(text.toUpperCase());
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
