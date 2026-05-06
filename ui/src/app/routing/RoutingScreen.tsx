import { ArrowLeft, ChevronRight, GripVertical, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { Modal } from '../../components/overlays';
import { formatCountryLabel, formatProviderLabel, formatServiceLabel } from '../../lib/formatters';
import {
  AppButton,
  ModalField,
  PageHeader,
  SearchField,
  SectionHeader,
  SegmentedControl,
  SelectTrigger,
  StatusBadge,
  ToggleSwitch,
} from '../ui-bridge';
import type {
  ProviderDynamicOptions,
  ProviderManifest,
  ProviderPriceItem,
  RoutingExecutionMode,
  RoutingPlan,
  RoutingPlanFilter,
  RoutingPlanItem,
} from '../types';

export type RoutingItemEditorState = {
  itemId: string;
  providerId: string;
  country: string;
  operator: string;
  minPrice: string;
  maxPrice: string;
};

export type RoutingScreenProps = {
  view: 'matrix' | 'detail';
  plans: RoutingPlan[];
  providers: ProviderManifest[];
  providerOptions: Record<string, ProviderDynamicOptions>;
  serviceOptions: Array<{ id: string; label: string }>;
  selectedPlanId: string;
  routingFilter: RoutingPlanFilter;
  routingSearch: string;
  itemEditor: RoutingItemEditorState | null;
  itemEditorLoading: boolean;
  itemPriceOptions: ProviderPriceItem[];
  onSelectPlan: (planId: string) => void;
  onBackToList: () => void;
  onCreatePlan: () => void;
  onDeletePlan: (planId: string) => void;
  onUpdatePlan: (plan: RoutingPlan) => void;
  onUpdateRoutingFilter: (value: RoutingPlanFilter) => void;
  onUpdateRoutingSearch: (value: string) => void;
  onOpenServicePicker: () => void;
  onOpenProviderPicker: (itemId: string) => void;
  onAddItem: () => void;
  onRemoveItem: (itemId: string) => void;
  onMoveItem: (itemId: string, direction: 'up' | 'down') => void;
  onReorderItem: (fromIndex: number, toIndex: number) => void;
  onSavePlan: (plan: RoutingPlan) => void;
  onOpenItemEditor: (itemId: string) => void;
  onCloseItemEditor: () => void;
  onItemEditorChange: (patch: Partial<RoutingItemEditorState>) => void;
  onApplyItemEditor: () => void;
  onLoadItemPriceOptions: () => void;
  onUseItemPriceQuickFill: (kind: 'min' | 'max', price: number) => void;
  busyAction: string;
};

function emptyPlan(): RoutingPlan {
  return {
    id: '',
    name: '',
    service: '',
    description: '',
    enabled: true,
    execution_mode: 'sequential',
    items: [],
  };
}

function summarizePrice(item: RoutingPlanItem) {
  if (item.price_mode === 'fixed' && item.fixed_price != null) {
    return `$${item.fixed_price.toFixed(3)} fixed`;
  }
  if (item.min_price != null || item.max_price != null) {
    return `${item.min_price != null ? `$${item.min_price.toFixed(3)}` : 'Min'} - ${item.max_price != null ? `$${item.max_price.toFixed(3)}` : 'Max'}`;
  }
  return 'No price limit';
}

export function RoutingScreen(props: RoutingScreenProps) {
  const plan = props.plans.find((item) => item.id === props.selectedPlanId) ?? props.plans[0] ?? emptyPlan();
  const enabledPlans = props.plans.filter((item) => item.enabled).length;
  const disabledPlans = props.plans.length - enabledPlans;
  const filteredPlans = props.plans.filter((planItem) => {
    if (props.routingFilter === 'enabled' && !planItem.enabled) return false;
    if (props.routingFilter === 'disabled' && planItem.enabled) return false;
    const term = props.routingSearch.trim().toLowerCase();
    if (!term) return true;
    return [
      planItem.name,
      planItem.service,
      planItem.description ?? '',
      planItem.id,
    ].some((value) => value.toLowerCase().includes(term));
  });
  if (props.view === 'matrix') {
    return (
      <RoutingPlanMatrixScreen
        plans={filteredPlans}
        totalPlans={props.plans.length}
        enabledPlans={enabledPlans}
        disabledPlans={disabledPlans}
        serviceOptions={props.serviceOptions}
        routingFilter={props.routingFilter}
        routingSearch={props.routingSearch}
        onCreatePlan={props.onCreatePlan}
        onSelectPlan={props.onSelectPlan}
        onTogglePlan={(planItem, enabled) => props.onUpdatePlan({ ...planItem, enabled })}
        onUpdateRoutingFilter={props.onUpdateRoutingFilter}
        onUpdateRoutingSearch={props.onUpdateRoutingSearch}
      />
    );
  }

  return (
    <>
      <RoutingPlanDetailScreen
        plan={plan}
        providers={props.providers}
        providerOptions={props.providerOptions}
        serviceOptions={props.serviceOptions}
        busyAction={props.busyAction}
        onBackToList={props.onBackToList}
        onDeletePlan={props.onDeletePlan}
        onUpdatePlan={props.onUpdatePlan}
        onOpenServicePicker={props.onOpenServicePicker}
        onSavePlan={props.onSavePlan}
        onAddItem={props.onAddItem}
        onRemoveItem={props.onRemoveItem}
        onMoveItem={props.onMoveItem}
        onReorderItem={props.onReorderItem}
        onOpenProviderPicker={props.onOpenProviderPicker}
        onOpenItemEditor={props.onOpenItemEditor}
      />
      <RoutingItemEditorModal
        editor={props.itemEditor}
        provider={props.providers.find((item) => item.id === props.itemEditor?.providerId)}
        providerOptions={props.itemEditor ? props.providerOptions[props.itemEditor.providerId] : undefined}
        priceItems={props.itemPriceOptions}
        loading={props.itemEditorLoading}
        onClose={props.onCloseItemEditor}
        onChange={props.onItemEditorChange}
        onApply={props.onApplyItemEditor}
        onLoadPriceOptions={props.onLoadItemPriceOptions}
        onQuickFill={props.onUseItemPriceQuickFill}
      />
    </>
  );
}

function RoutingPlanMatrixScreen(props: {
  plans: RoutingPlan[];
  totalPlans: number;
  enabledPlans: number;
  disabledPlans: number;
  serviceOptions: Array<{ id: string; label: string }>;
  routingFilter: RoutingPlanFilter;
  routingSearch: string;
  onCreatePlan: () => void;
  onSelectPlan: (planId: string) => void;
  onTogglePlan: (plan: RoutingPlan, enabled: boolean) => void;
  onUpdateRoutingFilter: (value: RoutingPlanFilter) => void;
  onUpdateRoutingSearch: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Routing Plans"
        subtitle="先在这里管理命名方案卡片，再进入单个方案详情维护候选列表。"
        meta={(
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-ds-text-secondary">
            <span>{props.totalPlans} 个方案</span>
            <span>{props.enabledPlans} 个启用</span>
            <span>{props.disabledPlans} 个停用</span>
            <span>{props.serviceOptions.length} 个服务</span>
          </div>
        )}
        actions={(
          <AppButton variant="primary" onClick={props.onCreatePlan}>
            <Plus size={14} />
            新建方案
          </AppButton>
        )}
      />

      <section className="rounded-[28px] border border-ds-border bg-[linear-gradient(180deg,var(--ds-color-surface-default)_0%,var(--ds-color-surface-subtle)_100%)] p-6 shadow-[0_14px_34px_rgba(0,0,0,0.07)]">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-4 min-[900px]:flex-row min-[900px]:items-end min-[900px]:justify-between">
            <div className="max-w-[620px]">
              <SectionHeader
                eyebrow="Routing Matrix"
                title="方案卡片矩阵"
                description="每张卡片代表一个命名路由方案。可以筛选、搜索、启停，然后进入详情维护顺序或随机执行的候选行。"
              />
            </div>
            <div className="grid gap-3 min-[900px]:grid-cols-[220px_320px]">
              <div className="rounded-[18px] border border-ds-border bg-ds-surface px-4 py-3">
                <div className="mb-2 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ds-text-secondary">
                  <SlidersHorizontal size={14} />
                  Filter
                </div>
                <SegmentedControl
                  items={[
                    { id: 'all', label: '全部' },
                    { id: 'enabled', label: '启用中' },
                    { id: 'disabled', label: '已停用' },
                  ]}
                  value={props.routingFilter}
                  onChange={props.onUpdateRoutingFilter}
                  appearance="rail"
                />
              </div>
              <div className="rounded-[18px] border border-ds-border bg-ds-surface px-4 py-3">
                <div className="mb-2 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ds-text-secondary">
                  <Search size={14} />
                  Search
                </div>
                <SearchField
                  compact
                  value={props.routingSearch}
                  onChange={(event) => props.onUpdateRoutingSearch(event.target.value)}
                  placeholder="按方案名、service、描述或 id 搜索"
                />
              </div>
            </div>
          </div>

          {props.plans.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 min-[860px]:grid-cols-2 min-[1180px]:grid-cols-3">
              {props.plans.map((plan) => (
                <button
                  key={plan.id || plan.name}
                  type="button"
                  onClick={() => props.onSelectPlan(plan.id)}
                  className="group rounded-[24px] border border-ds-border bg-ds-surface p-5 text-left shadow-[0_10px_24px_rgba(0,0,0,0.05)] transition-transform duration-fast ease-[var(--ds-motion-transition-fast)] hover:-translate-y-0.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ds-text-secondary">
                        {formatServiceLabel(plan.service || 'service')}
                      </div>
                      <div className="mt-2 truncate text-[20px] font-semibold tracking-[-0.03em] text-ds-text-primary">
                        {plan.name || '未命名方案'}
                      </div>
                    </div>
                    <div
                      className="flex items-center gap-2"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <StatusBadge tone={plan.enabled ? 'green' : 'gray'}>
                        {plan.enabled ? 'Enabled' : 'Disabled'}
                      </StatusBadge>
                      <ToggleSwitch
                        checked={plan.enabled}
                        onChange={(enabled) => props.onTogglePlan(plan, enabled)}
                        ariaLabel={`Toggle plan ${plan.name || plan.id}`}
                      />
                    </div>
                  </div>
                  <p className="mt-3 min-h-[42px] text-[13px] leading-[1.6] text-ds-text-secondary">
                    {plan.description || '还没有描述。建议说明这个方案面向哪个业务流量，以及希望优先命中哪些国家或价格带。'}
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <StatusBadge tone={plan.items.some((item) => item.enabled) ? 'green' : 'orange'}>
                      {plan.items.filter((item) => item.enabled).length} 行启用
                    </StatusBadge>
                    <StatusBadge tone="gray">
                      {plan.execution_mode === 'random' ? 'Random' : 'Sequential'}
                    </StatusBadge>
                  </div>
                  <div className="mt-5 flex items-center justify-between border-t border-ds-border pt-4 text-[12px] text-ds-text-secondary">
                    <span className="truncate">ID：{plan.id || 'draft'}</span>
                    <span className="inline-flex items-center gap-1 text-ds-text-primary">
                      进入详情
                      <ChevronRight size={14} className="transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-[22px] border border-ds-border bg-ds-surface px-6 py-12 text-center text-[14px] text-ds-text-secondary">
              没有匹配的方案。可以调整筛选条件，或者直接新建一个方案。
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function RoutingPlanDetailScreen(props: {
  plan: RoutingPlan;
  providers: ProviderManifest[];
  providerOptions: Record<string, ProviderDynamicOptions>;
  serviceOptions: Array<{ id: string; label: string }>;
  busyAction: string;
  onBackToList: () => void;
  onDeletePlan: (planId: string) => void;
  onUpdatePlan: (plan: RoutingPlan) => void;
  onOpenServicePicker: () => void;
  onSavePlan: (plan: RoutingPlan) => void;
  onAddItem: () => void;
  onRemoveItem: (itemId: string) => void;
  onMoveItem: (itemId: string, direction: 'up' | 'down') => void;
  onReorderItem: (fromIndex: number, toIndex: number) => void;
  onOpenProviderPicker: (itemId: string) => void;
  onOpenItemEditor: (itemId: string) => void;
}) {
  const enabledItemCount = props.plan.items.filter((item) => item.enabled).length;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={props.plan.name || 'Routing Plan Detail'}
        subtitle="这里编辑单个方案的执行模式、启用状态和候选行列表。布局改成单页详情，避免左右两栏挤在一起。"
        meta={(
          <button
            type="button"
            onClick={props.onBackToList}
            className="inline-flex items-center gap-2 rounded-pill border border-ds-border bg-ds-surface px-3 py-2 text-[12px] text-ds-text-secondary"
          >
            <ArrowLeft size={14} />
            返回方案矩阵
          </button>
        )}
        actions={(
          <div className="flex flex-wrap items-center gap-3">
            <AppButton variant="outline" onClick={() => props.onDeletePlan(props.plan.id)} disabled={!props.plan.id || props.busyAction === 'delete-routing-plan'}>
              删除方案
            </AppButton>
            <AppButton variant="primary" onClick={() => props.onSavePlan(props.plan)} disabled={props.busyAction === 'save-routing-plan'}>
              {props.busyAction === 'save-routing-plan' ? '保存中…' : '保存方案'}
            </AppButton>
          </div>
        )}
      />

      <section className="rounded-[28px] border border-ds-border bg-[linear-gradient(180deg,var(--ds-color-surface-default)_0%,var(--ds-color-surface-subtle)_100%)] p-6 shadow-[0_14px_34px_rgba(0,0,0,0.07)]">
        <div className="grid grid-cols-1 gap-4 min-[860px]:grid-cols-[minmax(0,1.2fr)_320px]">
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-1 gap-4 min-[760px]:grid-cols-2">
              <div className="rounded-[22px] border border-ds-border bg-ds-surface px-5 py-5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ds-text-secondary">Plan Name</div>
                <input
                  value={props.plan.name}
                  onChange={(event) => props.onUpdatePlan({ ...props.plan, name: event.target.value })}
                  className="mt-3 min-h-control w-full rounded-sm border border-ds-border-strong bg-ds-surface px-4 py-[11px] text-utility text-ds-text-primary"
                  placeholder="例如 OpenAI 主路由"
                />
                <div className="mt-2 text-[12px] text-ds-text-secondary">
                  方案 id 由系统随机生成，名称可以自行维护。
                </div>
              </div>
              <div className="rounded-[22px] border border-ds-border bg-ds-surface px-5 py-5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ds-text-secondary">Service</div>
                <button
                  type="button"
                  onClick={props.onOpenServicePicker}
                  className="mt-3 min-h-control w-full rounded-sm border border-ds-border-strong bg-ds-surface px-4 py-[11px] text-left text-utility text-ds-text-primary"
                >
                  {props.plan.service ? formatServiceLabel(props.plan.service) : '选择 service'}
                </button>
                <div className="mt-2 text-[12px] text-ds-text-secondary">
                  当前可选服务数：{props.serviceOptions.length}
                </div>
              </div>
            </div>

            <div className="rounded-[22px] border border-ds-border bg-ds-surface px-5 py-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ds-text-secondary">Description</div>
              <textarea
                value={props.plan.description ?? ''}
                onChange={(event) => props.onUpdatePlan({ ...props.plan, description: event.target.value })}
                className="mt-3 min-h-[110px] w-full rounded-sm border border-ds-border-strong bg-ds-surface px-4 py-3 text-[13px] text-ds-text-primary"
                placeholder="说明这个方案的使用场景和路由意图。"
              />
            </div>

            <div className="rounded-[22px] border border-ds-border bg-ds-surface px-5 py-5">
              <SectionHeader
                eyebrow="Plan Items"
                title="候选行列表"
                description="每一行都可以排序。顺序模式按列表顺序尝试，随机模式保留但仍复用同一批候选行。"
                actions={(
                  <AppButton variant="outline" size="utility" onClick={props.onAddItem}>
                    <Plus size={14} />
                    添加一行
                  </AppButton>
                )}
              />
              <div className="mt-4 flex flex-col gap-3">
                {props.plan.items.length > 0 ? props.plan.items.map((item, index) => (
                  <RoutingPlanRowCard
                    key={item.id}
                    item={item}
                    index={index}
                    provider={props.providers.find((provider) => provider.id === item.provider)}
                    onOpenProviderPicker={() => props.onOpenProviderPicker(item.id)}
                    onEdit={() => props.onOpenItemEditor(item.id)}
                    onRemove={() => props.onRemoveItem(item.id)}
                    onMove={(direction) => props.onMoveItem(item.id, direction)}
                    onDragMove={props.onReorderItem}
                    onToggleEnabled={(enabled) => props.onUpdatePlan({
                      ...props.plan,
                      items: props.plan.items.map((current) => current.id === item.id ? { ...current, enabled } : current),
                    })}
                  />
                )) : (
                  <div className="rounded-[18px] border border-ds-border bg-ds-surface-subtle px-5 py-10 text-center text-[13px] text-ds-text-secondary">
                    这个方案还没有候选行。先添加一行，再进入弹窗编辑国家、运营商和价格上下限。
                  </div>
                )}
              </div>
            </div>
          </div>

          <aside className="flex flex-col gap-4">
            <div className="rounded-[22px] border border-ds-border bg-ds-surface px-5 py-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ds-text-secondary">Plan Health</div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <StatusBadge tone={props.plan.enabled ? 'green' : 'gray'}>
                  {props.plan.enabled ? 'Enabled' : 'Disabled'}
                </StatusBadge>
                <StatusBadge tone={enabledItemCount > 0 ? 'green' : 'orange'}>
                  {enabledItemCount} 行启用
                </StatusBadge>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ds-text-secondary">方案启用</span>
                <ToggleSwitch
                  checked={props.plan.enabled}
                  onChange={(enabled) => props.onUpdatePlan({ ...props.plan, enabled })}
                  ariaLabel="Toggle routing plan"
                />
              </div>
              <div className="mt-4">
                <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-ds-text-secondary">执行模式</div>
                <SegmentedControl
                  items={[
                    { id: 'sequential', label: '顺序' },
                    { id: 'random', label: '随机' },
                  ]}
                  value={props.plan.execution_mode as RoutingExecutionMode}
                  onChange={(value) => props.onUpdatePlan({ ...props.plan, execution_mode: value })}
                  appearance="rail"
                />
              </div>
              <div className="mt-4 text-[12px] leading-[1.6] text-ds-text-secondary">
                {props.plan.execution_mode === 'random'
                  ? '随机模式会先为 ticket 生成一份候选顺序，再沿该顺序做 failover。'
                  : '顺序模式会严格按照列表从上到下尝试命中。'}
              </div>
            </div>

            <div className="rounded-[22px] border border-ds-border bg-ds-surface px-5 py-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ds-text-secondary">System Id</div>
              <div className="mt-3 break-all rounded-[16px] border border-ds-border bg-ds-surface-subtle px-4 py-3 font-mono text-[12px] text-ds-text-secondary">
                {props.plan.id || '保存后生成随机 id'}
              </div>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}

function RoutingPlanRowCard(props: {
  item: RoutingPlanItem;
  index: number;
  provider?: ProviderManifest;
  onOpenProviderPicker: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onMove: (direction: 'up' | 'down') => void;
  onDragMove: (fromIndex: number, toIndex: number) => void;
  onToggleEnabled: (enabled: boolean) => void;
}) {
  return (
    <div className="rounded-[20px] border border-ds-border bg-ds-surface p-4 shadow-[0_6px_18px_rgba(0,0,0,0.05)]">
      <div className="grid grid-cols-1 gap-4 min-[980px]:grid-cols-[minmax(0,1fr)_auto] min-[980px]:items-center">
        <div
          draggable
          onDragStart={(event) => event.dataTransfer.setData('text/plain', String(props.index))}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const fromIndex = Number(event.dataTransfer.getData('text/plain'));
            if (!Number.isNaN(fromIndex)) props.onDragMove(fromIndex, props.index);
          }}
          className="grid grid-cols-1 gap-3 min-[760px]:grid-cols-[40px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] min-[760px]:items-center"
        >
          <div className="flex items-center gap-2 text-ds-text-secondary">
            <GripVertical size={16} className="opacity-40" />
            <span className="text-[12px] font-semibold">#{props.index + 1}</span>
          </div>
          <button type="button" onClick={props.onOpenProviderPicker} className="rounded-[16px] border border-ds-border bg-ds-surface-subtle px-4 py-3 text-left">
            <div className="text-[11px] uppercase tracking-[0.08em] text-ds-text-secondary">Provider</div>
            <div className="mt-1 text-[14px] font-semibold text-ds-text-primary">
              {props.provider ? formatProviderLabel(props.provider.name) : '选择 provider'}
            </div>
          </button>
          <MetricCard label="国家" value={props.item.country ? formatCountryLabel(props.item.country) : '不限'} />
          <MetricCard label="运营商" value={props.item.operator || '不限'} />
          <MetricCard label="最小值" value={props.item.min_price != null ? `$${props.item.min_price.toFixed(3)}` : '不限'} />
          <MetricCard label="最大值" value={props.item.max_price != null ? `$${props.item.max_price.toFixed(3)}` : '不限'} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ToggleSwitch checked={props.item.enabled} onChange={props.onToggleEnabled} ariaLabel={`Toggle row ${props.index + 1}`} />
          <AppButton variant="ghost" size="utility" onClick={() => props.onMove('up')}>上移</AppButton>
          <AppButton variant="ghost" size="utility" onClick={() => props.onMove('down')}>下移</AppButton>
          <AppButton variant="outline" size="utility" onClick={props.onEdit}>编辑</AppButton>
          <AppButton variant="danger-outline" size="utility" onClick={props.onRemove}>删除</AppButton>
        </div>
      </div>
    </div>
  );
}

function MetricCard(props: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-ds-border bg-ds-surface-subtle px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.08em] text-ds-text-secondary">{props.label}</div>
      <div className="mt-1 text-[14px] font-semibold text-ds-text-primary">{props.value}</div>
    </div>
  );
}

function RoutingItemEditorModal(props: {
  editor: RoutingItemEditorState | null;
  provider?: ProviderManifest;
  providerOptions?: ProviderDynamicOptions;
  priceItems: ProviderPriceItem[];
  loading: boolean;
  onClose: () => void;
  onChange: (patch: Partial<RoutingItemEditorState>) => void;
  onApply: () => void;
  onLoadPriceOptions: () => void;
  onQuickFill: (kind: 'min' | 'max', price: number) => void;
}) {
  if (!props.editor) return null;

  const filteredPriceItems = props.priceItems.filter((item) => {
    const countryTerm = props.editor.country.trim().toLowerCase();
    const operatorTerm = props.editor.operator.trim().toLowerCase();
    const minPrice = props.editor.minPrice.trim() === '' ? null : Number(props.editor.minPrice);
    const maxPrice = props.editor.maxPrice.trim() === '' ? null : Number(props.editor.maxPrice);

    if (countryTerm) {
      const matchesCountry = item.country.toLowerCase().includes(countryTerm)
        || formatCountryLabel(item.country).toLowerCase().includes(countryTerm);
      if (!matchesCountry) return false;
    }
    if (operatorTerm && !item.operator.toLowerCase().includes(operatorTerm)) {
      return false;
    }
    if (minPrice != null && !Number.isNaN(minPrice) && item.price < minPrice) {
      return false;
    }
    if (maxPrice != null && !Number.isNaN(maxPrice) && item.price > maxPrice) {
      return false;
    }
    return true;
  });

  return (
    <Modal
      open
      variant="wide"
      title="编辑候选行"
      subtitle="这里维护国家、运营商和金额上下限。价格清单只依赖 provider 与 service，不需要先选国家。"
      onClose={props.onClose}
      actions={<AppButton variant="ghost" size="utility" onClick={props.onClose}>关闭</AppButton>}
      footer={(
        <>
          <AppButton variant="outline" onClick={props.onClose}>取消</AppButton>
          <AppButton variant="primary" onClick={props.onApply}>应用修改</AppButton>
        </>
      )}
    >
      <div className="grid grid-cols-1 gap-6 min-[900px]:grid-cols-[360px_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <div className="rounded-[18px] border border-ds-border bg-ds-surface-subtle px-4 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ds-text-secondary">Provider</div>
            <div className="mt-2 text-[16px] font-semibold text-ds-text-primary">
              {props.provider ? formatProviderLabel(props.provider.name) : '未选择 provider'}
            </div>
          </div>

          <ModalField label="COUNTRY" hint={`可选 ${props.providerOptions?.countries.length ?? 0} 个国家`}>
            <input
              value={props.editor.country}
              onChange={(event) => props.onChange({ country: event.target.value })}
              className="min-h-control rounded-sm border border-ds-border-strong bg-ds-surface px-4 py-[11px] text-utility text-ds-text-primary"
              placeholder="留空表示不限"
            />
          </ModalField>

          <ModalField label="OPERATOR" hint={`可选 ${props.providerOptions?.operators.length ?? 0} 个运营商`}>
            <input
              value={props.editor.operator}
              onChange={(event) => props.onChange({ operator: event.target.value })}
              className="min-h-control rounded-sm border border-ds-border-strong bg-ds-surface px-4 py-[11px] text-utility text-ds-text-primary"
              placeholder="留空表示不限"
            />
          </ModalField>

          <ModalField label="MIN PRICE">
            <input
              value={props.editor.minPrice}
              inputMode="decimal"
              onChange={(event) => props.onChange({ minPrice: event.target.value })}
              className="min-h-control rounded-sm border border-ds-border-strong bg-ds-surface px-4 py-[11px] text-utility text-ds-text-primary"
              placeholder="例如 0.50"
            />
          </ModalField>

          <ModalField label="MAX PRICE">
            <input
              value={props.editor.maxPrice}
              inputMode="decimal"
              onChange={(event) => props.onChange({ maxPrice: event.target.value })}
              className="min-h-control rounded-sm border border-ds-border-strong bg-ds-surface px-4 py-[11px] text-utility text-ds-text-primary"
              placeholder="例如 1.20"
            />
          </ModalField>
        </div>

        <div className="flex flex-col gap-4 rounded-[22px] border border-ds-border bg-ds-surface px-5 py-5">
          <div className="flex flex-col gap-3 min-[900px]:flex-row min-[900px]:items-center min-[900px]:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ds-text-secondary">Price Inventory</div>
              <div className="mt-1 text-[13px] text-ds-text-secondary">
                API 实际只按 provider 和 service 拉取价格；你上面填写的国家、运营商和价格上下限会在这里做本地过滤展示。
              </div>
            </div>
            <AppButton variant="outline" onClick={props.onLoadPriceOptions} disabled={props.loading}>
              {props.loading ? '加载中…' : '加载清单'}
            </AppButton>
          </div>

          <div className="max-h-[420px] overflow-y-auto rounded-[18px] border border-ds-border bg-ds-surface-subtle">
            {filteredPriceItems.length > 0 ? filteredPriceItems.map((item) => (
              <div
                key={`${item.country}-${item.operator}-${item.price}`}
                className="grid grid-cols-1 gap-3 border-b border-ds-border px-4 py-4 last:border-b-0 min-[760px]:grid-cols-[minmax(0,1.2fr)_120px_120px_auto]"
              >
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-semibold text-ds-text-primary">
                    {formatCountryLabel(item.country)} · {item.operator || 'any'}
                  </div>
                  <div className="mt-1 text-[12px] text-ds-text-secondary">
                    stock：{item.stock.toLocaleString()}
                  </div>
                </div>
                <div className="text-[13px] text-ds-text-secondary">{item.price.toFixed(3)}</div>
                <div className="text-[13px] text-ds-text-secondary">{item.country}</div>
                <div className="flex items-center gap-2">
                  <AppButton variant="ghost" size="utility" onClick={() => props.onQuickFill('min', item.price)}>最小</AppButton>
                  <AppButton variant="ghost" size="utility" onClick={() => props.onQuickFill('max', item.price)}>最大</AppButton>
                </div>
              </div>
            )) : (
              <div className="px-5 py-10 text-center text-[13px] text-ds-text-secondary">
                {props.priceItems.length > 0
                  ? '已经加载价格清单，但当前筛选条件下没有匹配项。'
                  : '还没有价格清单。点击上方按钮后，会列出当前 provider 在该 service 下返回的价格行。'}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 min-[760px]:grid-cols-3">
            <SelectTrigger
              value={props.editor.country ? formatCountryLabel(props.editor.country) : ''}
              placeholder="当前国家筛选"
              onClick={() => {}}
              disabled
              className="is-disabled-look"
            />
            <SelectTrigger
              value={props.editor.operator}
              placeholder="当前运营商筛选"
              onClick={() => {}}
              disabled
              className="is-disabled-look"
            />
            <div className="inline-flex min-h-control items-center rounded-sm border border-ds-border-strong bg-ds-surface px-4 py-[11px] text-[13px] text-ds-text-secondary">
              Min {props.editor.minPrice || '—'} / Max {props.editor.maxPrice || '—'}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
