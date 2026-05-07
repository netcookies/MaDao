import { useState, useEffect } from 'react';
import { ChevronRight, GripVertical, Plus } from 'lucide-react';
import { Modal } from '../../components/overlays';
import { formatCountryLabel, formatProviderLabel, formatServiceLabel } from '../../lib/formatters';
import { cx } from '../../lib/cx';
import {
  AppButton,
  ModalField,
  PageHeader,
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
  onOpenItemSelector: (itemId: string, field: 'provider' | 'country' | 'operator') => void;
  onAddItem: () => void;
  onRemoveItem: (itemId: string) => void;
  onReorderItem: (fromIndex: number, toIndex: number) => void;
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
        onAddItem={props.onAddItem}
        onRemoveItem={props.onRemoveItem}
        onReorderItem={props.onReorderItem}
        onOpenProviderPicker={props.onOpenProviderPicker}
        onOpenItemSelector={props.onOpenItemSelector}
        onOpenItemEditor={props.onOpenItemEditor}
      />
      <RoutingItemEditorModal
        editor={props.itemEditor}
        providers={props.providers}
        provider={props.providers.find((item) => item.id === props.itemEditor?.providerId)}
        providerOptions={props.itemEditor ? props.providerOptions[props.itemEditor.providerId] : undefined}
        priceItems={props.itemPriceOptions}
        loading={props.itemEditorLoading}
        onClose={props.onCloseItemEditor}
        onChange={props.onItemEditorChange}
        onOpenSelector={(field) => props.itemEditor && props.onOpenItemSelector(props.itemEditor.itemId, field)}
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
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Routing Plans"
        subtitle="Browse reusable routing plans and open any plan to manage its candidates."
      />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <span className="text-[13px] text-ds-text-secondary">
          {props.plans.length} {props.plans.length === 1 ? 'plan' : 'plans'}
        </span>
        <SegmentedControl
          items={[
            { id: 'all', label: 'All' },
            { id: 'enabled', label: 'Active' },
            { id: 'disabled', label: 'Inactive' },
          ]}
          value={props.routingFilter}
          onChange={props.onUpdateRoutingFilter}
          appearance="rail"
          className="flex-nowrap"
        />
      </div>

      {props.plans.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 min-[860px]:grid-cols-2">
          {props.plans.map((plan) => (
            <button
              key={plan.id || plan.name}
              type="button"
              onClick={() => props.onSelectPlan(plan.id)}
              className="group rounded-2xl border border-ds-border bg-ds-surface p-5 text-left shadow-ds backdrop-blur-ds transition-transform duration-fast ease-[var(--ds-motion-transition-fast)] hover:-translate-y-0.5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="inline-flex min-w-0 items-center gap-3">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ds-surface-subtle text-ds-text-secondary">
                    <RoutingShuffleIcon />
                  </span>
                  <span className="truncate text-[14px] font-semibold text-ds-text-primary">
                    {plan.name || 'Untitled Plan'}
                  </span>
                </div>
                <StatusBadge tone={plan.enabled ? 'green' : 'gray'}>
                  {plan.enabled ? 'Enabled' : 'Disabled'}
                </StatusBadge>
              </div>

              <div className="mt-4">
                <span
                  className={`inline-flex items-center rounded-pill px-2.5 py-1 font-text text-caption font-semibold tracking-[var(--ds-type-caption-tracking)] ${
                    plan.service
                      ? 'bg-ds-accent-soft text-ds-accent-blue'
                      : 'bg-ds-surface-subtle text-ds-text-secondary'
                  }`}
                >
                  {plan.service ? formatServiceLabel(plan.service) : 'No Service'}
                </span>
              </div>

              <p
                className="mt-3 text-[12px] leading-relaxed text-ds-text-secondary"
                style={{
                  display: '-webkit-box',
                  WebkitBoxOrient: 'vertical',
                  WebkitLineClamp: 2,
                  overflow: 'hidden',
                }}
              >
                {plan.description || 'No description yet. Add context so this route is easier to maintain later.'}
              </p>

              <div className="mt-5 flex items-center justify-between text-[12px] text-ds-text-secondary">
                <span>
                  {plan.items.length} {plan.items.length === 1 ? 'candidate' : 'candidates'}
                </span>
                <span className="inline-flex items-center gap-1 text-ds-accent-blue">
                  Manage
                  <ChevronRight size={12} className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-ds-border bg-ds-surface px-6 py-12 text-center text-[14px] text-ds-text-secondary shadow-ds backdrop-blur-ds">
          No plans match the current filters.
        </div>
      )}
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
  onAddItem: () => void;
  onRemoveItem: (itemId: string) => void;
  onReorderItem: (fromIndex: number, toIndex: number) => void;
  onOpenProviderPicker: (itemId: string) => void;
  onOpenItemSelector: (itemId: string, field: 'provider' | 'country' | 'operator') => void;
  onOpenItemEditor: (itemId: string) => void;
}) {
  const toggleLabel = props.plan.enabled ? 'Enabled' : 'Disabled';
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null);

  useEffect(() => {
    setDraggedItemId(null);
    setDragOverItemId(null);
  }, [props.plan.id, props.plan.items.length]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 min-[860px]:flex-row min-[860px]:items-start min-[860px]:justify-between">
        <div className="flex flex-col gap-[3px]">
          <h1 className="m-0 text-[20px] font-semibold leading-none tracking-[-0.3px] text-ds-text-primary">
            {props.plan.name || 'Untitled Plan'}
          </h1>
          <p className="m-0 text-[13px] leading-none text-ds-text-secondary opacity-50">
            Manage service matching, execution order, and candidate availability for this routing plan.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <AppButton
            variant="danger-outline"
            size="utility"
            onClick={() => props.onDeletePlan(props.plan.id)}
            disabled={!props.plan.id || props.busyAction === 'delete-routing-plan'}
          >
            {props.busyAction === 'delete-routing-plan' ? 'Deleting...' : 'Delete Plan'}
          </AppButton>
        </div>
      </div>

      <section className="rounded-2xl border border-ds-border bg-ds-surface p-6 shadow-ds backdrop-blur-ds">
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between gap-4">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ds-text-secondary">
              PLAN DETAILS
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-ds-text-primary">
                {toggleLabel}
              </span>
              <ToggleSwitch
                checked={props.plan.enabled}
                onChange={(enabled) => props.onUpdatePlan({ ...props.plan, enabled })}
                ariaLabel="Toggle routing plan"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 min-[760px]:grid-cols-[minmax(0,1fr)_200px]">
            <label className="flex flex-col gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ds-text-secondary">
                Name
              </span>
              <input
                value={props.plan.name}
                onChange={(event) => props.onUpdatePlan({ ...props.plan, name: event.target.value })}
                className="min-h-control w-full rounded-[10px] border border-ds-border-strong bg-ds-surface px-4 py-[11px] text-utility text-ds-text-primary"
                placeholder="OpenAI Primary Route"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ds-text-secondary">
                Service
              </span>
              <SelectTrigger
                value={props.plan.service ? formatServiceLabel(props.plan.service) : ''}
                placeholder="Choose service"
                onClick={props.onOpenServicePicker}
                className="w-full"
              />
            </label>
          </div>

          <label className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ds-text-secondary">
              Description
            </span>
            <textarea
              value={props.plan.description ?? ''}
              onChange={(event) => props.onUpdatePlan({ ...props.plan, description: event.target.value })}
              className="min-h-[80px] w-full rounded-[10px] border border-ds-border-strong bg-ds-surface px-4 py-3 text-[13px] text-ds-text-primary"
              placeholder="Describe when this plan should be used and what kind of candidates it should prefer."
            />
          </label>

          <div className="flex flex-col gap-4 min-[760px]:flex-row min-[760px]:items-end min-[760px]:justify-between">
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ds-text-secondary">
                Execution Mode
              </span>
              <SegmentedControl
                items={[
                  { id: 'sequential', label: 'Sequential' },
                  { id: 'random', label: 'Random' },
                ]}
                value={props.plan.execution_mode as RoutingExecutionMode}
                onChange={(value) => props.onUpdatePlan({ ...props.plan, execution_mode: value })}
                appearance="rail"
                className="flex-nowrap"
              />
            </div>

            <div className="min-[760px]:text-right">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ds-text-secondary">
                Plan ID
              </div>
              <div className="mt-1 break-all font-mono text-[11px] text-ds-text-secondary">
                {props.plan.id || 'Save to generate an id'}
              </div>
            </div>
          </div>

        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 min-[760px]:flex-row min-[760px]:items-center min-[760px]:justify-between">
          <div className="flex items-center gap-2">
            <h2 className="m-0 text-[14px] font-semibold text-ds-text-primary">Route Candidates</h2>
            <span className="inline-flex items-center rounded-pill bg-ds-surface-subtle px-2.5 py-1 text-[12px] font-semibold text-ds-text-secondary">
              {props.plan.items.length}
            </span>
          </div>
          <AppButton variant="outline" size="utility" onClick={props.onAddItem}>
            <Plus size={14} />
            Add Candidate
          </AppButton>
        </div>

        <div className="overflow-hidden rounded-2xl border border-ds-border bg-ds-surface shadow-ds backdrop-blur-ds">
          <div className="hidden min-[900px]:grid min-[900px]:grid-cols-[24px_36px_minmax(0,1fr)_160px_120px_60px] min-[900px]:items-center bg-ds-surface-subtle px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ds-text-secondary">
            <span />
            <span>#</span>
            <span>Provider</span>
            <span>Country · Operator</span>
            <span>Price Range</span>
            <span className="text-right">Actions</span>
          </div>

          {props.plan.items.length > 0 ? props.plan.items.map((item, index) => {
            const provider = props.providers.find((entry) => entry.id === item.provider);
            const countryOperator = `${item.country ? formatCountryLabel(item.country) : 'Any country'} · ${item.operator || 'Any operator'}`;

            return (
              <div
                key={item.id}
                onDragOver={(event) => {
                  if (!draggedItemId || draggedItemId === item.id) return;
                  event.preventDefault();
                  if (dragOverItemId !== item.id) setDragOverItemId(item.id);
                }}
                onDrop={(event) => {
                  if (!draggedItemId || draggedItemId === item.id) return;
                  event.preventDefault();
                  const fromIndex = props.plan.items.findIndex((entry) => entry.id === draggedItemId);
                  if (fromIndex >= 0 && fromIndex !== index) props.onReorderItem(fromIndex, index);
                  setDraggedItemId(null);
                  setDragOverItemId(null);
                }}
                onDragLeave={(event) => {
                  const nextTarget = event.relatedTarget;
                  if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
                  if (dragOverItemId === item.id) setDragOverItemId(null);
                }}
                className={cx(
                  'grid grid-cols-[24px_minmax(0,1fr)_auto] gap-3 border-b border-ds-border px-4 py-3 last:border-b-0 min-[900px]:grid-cols-[24px_36px_minmax(0,1fr)_160px_120px_60px] min-[900px]:items-center',
                  item.enabled ? 'bg-ds-surface' : 'bg-ds-surface opacity-60',
                  dragOverItemId === item.id && 'border-t-2 border-t-ds-accent-blue',
                  draggedItemId === item.id && 'opacity-45',
                )}
              >
                <div
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', item.id);
                    setDraggedItemId(item.id);
                    setDragOverItemId(item.id);
                  }}
                  onDragEnd={() => {
                    setDraggedItemId(null);
                    setDragOverItemId(null);
                  }}
                  className="flex cursor-grab items-center justify-center text-ds-text-secondary min-[900px]:justify-start"
                  aria-label={`Drag candidate ${index + 1}`}
                >
                  <GripVertical size={14} className="opacity-30" />
                </div>

                <div className="hidden text-[13px] text-ds-text-secondary min-[900px]:block">
                  {index + 1}
                </div>

                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => props.onOpenProviderPicker(item.id)}
                    className="w-full truncate bg-transparent p-0 text-left text-[13px] font-medium text-ds-text-primary transition-colors duration-fast ease-[var(--ds-motion-transition-fast)] hover:text-ds-accent-blue"
                  >
                    {provider ? formatProviderLabel(provider.name) : 'Choose provider'}
                  </button>
                  <div className="mt-1 flex flex-wrap gap-3 text-[12px] text-ds-text-secondary min-[900px]:hidden">
                    <span>#{index + 1}</span>
                    <span>{countryOperator}</span>
                    <span>{summarizePrice(item)}</span>
                    {!item.enabled ? <span>Disabled</span> : null}
                  </div>
                </div>

                <div className="hidden text-[12px] text-ds-text-secondary min-[900px]:block">
                  {countryOperator}
                </div>

                <div className="hidden text-[12px] text-ds-text-secondary min-[900px]:block">
                  {summarizePrice(item)}
                </div>

                <div className="flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => props.onOpenItemEditor(item.id)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] text-ds-accent-blue transition-colors duration-fast ease-[var(--ds-motion-transition-fast)] hover:bg-ds-surface-subtle"
                    aria-label={`Edit candidate ${index + 1}`}
                    title="Edit candidate"
                  >
                    <RoutingPencilIcon />
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onRemoveItem(item.id)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] text-[rgb(224,68,62)] transition-colors duration-fast ease-[var(--ds-motion-transition-fast)] hover:bg-ds-surface-subtle"
                    aria-label={`Delete candidate ${index + 1}`}
                    title="Delete candidate"
                  >
                    <RoutingTrashIcon />
                  </button>
                </div>
              </div>
            );
          }) : (
            <div className="px-5 py-10 text-center text-[13px] text-ds-text-secondary">
              No candidates yet. Add a candidate to start building this route.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function RoutingShuffleIcon() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m18 14 4 4-4 4" />
      <path d="M2 18h4.5a4 4 0 0 0 3.2-1.6L22 2" />
      <path d="m18 2 4 4-4 4" />
      <path d="M2 6h4.5a4 4 0 0 1 3.2 1.6l2 2.4" />
    </svg>
  );
}

function RoutingPencilIcon() {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
    </svg>
  );
}

function RoutingTrashIcon() {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function RoutingItemEditorModal(props: {
  editor: RoutingItemEditorState | null;
  providers: ProviderManifest[];
  provider?: ProviderManifest;
  providerOptions?: ProviderDynamicOptions;
  priceItems: ProviderPriceItem[];
  loading: boolean;
  onClose: () => void;
  onChange: (patch: Partial<RoutingItemEditorState>) => void;
  onOpenSelector: (field: 'provider' | 'country' | 'operator') => void;
  onApply: () => void;
  onLoadPriceOptions: () => void;
  onQuickFill: (kind: 'min' | 'max', price: number) => void;
}) {
  const [priceMode, setPriceMode] = useState<'any' | 'range'>('any');

  const editor = props.editor;

  useEffect(() => {
    if (editor) {
      setPriceMode(editor.minPrice || editor.maxPrice ? 'range' : 'any');
    }
  }, [editor?.itemId]);

  if (!editor) return null;

  const filteredPriceItems = props.priceItems.filter((item) => {
    const countryTerm = editor.country.trim().toLowerCase();
    const operatorTerm = editor.operator.trim().toLowerCase();
    if (countryTerm) {
      const matchesCountry = item.country.toLowerCase().includes(countryTerm)
        || formatCountryLabel(item.country).toLowerCase().includes(countryTerm);
      if (!matchesCountry) return false;
    }
    if (operatorTerm && !item.operator.toLowerCase().includes(operatorTerm)) return false;
    return true;
  });

  const providerLabel = props.providers.find((provider) => provider.id === editor.providerId)?.name ?? editor.providerId;
  const isRangeMode = priceMode === 'range';
  const priceInputClass = `min-h-[34px] w-full rounded-[10px] border px-3 py-2 text-[13px] leading-none transition-[background-color,color,border-color,opacity] duration-fast ease-[var(--ds-motion-transition-fast)] ${
    isRangeMode
      ? 'border-ds-border-strong bg-ds-surface text-ds-text-primary'
      : 'border-ds-border bg-ds-window text-ds-text-secondary opacity-70'
  }`;

  return (
    <Modal
      open
      variant="wide"
      title="Edit Route Candidate"
      onClose={props.onClose}
      footer={(
        <>
          <AppButton variant="outline" onClick={props.onClose}>Cancel</AppButton>
          <AppButton variant="primary" size="utility" onClick={props.onApply}>Save Changes</AppButton>
        </>
      )}
    >
      <div className="flex flex-col gap-4 px-5 py-4">
        <div className="grid grid-cols-1 gap-3 min-[580px]:grid-cols-3">
          <ModalField label="PROVIDER">
            <SelectTrigger
              compact
              value={providerLabel ? formatProviderLabel(providerLabel) : ''}
              placeholder="Select provider"
              onClick={() => props.onOpenSelector('provider')}
              className="w-full"
            />
          </ModalField>
          <ModalField label="COUNTRY">
            <SelectTrigger
              compact
              value={editor.country ? formatCountryLabel(editor.country) : ''}
              placeholder="Any country"
              onClick={() => props.onOpenSelector('country')}
              className="w-full"
            />
          </ModalField>
          <ModalField label="CARRIER">
            <SelectTrigger
              compact
              value={editor.operator}
              placeholder="Any carrier"
              onClick={() => props.onOpenSelector('operator')}
              className="w-full"
            />
          </ModalField>
        </div>

        <div className="grid grid-cols-1 gap-3 min-[680px]:grid-cols-[auto_minmax(0,1fr)] min-[680px]:items-end">
          <ModalField label="PRICE MODE">
            <SegmentedControl
              items={[{ id: 'any', label: 'Any' }, { id: 'range', label: 'Range' }]}
              value={priceMode}
              onChange={(v) => {
                setPriceMode(v as 'any' | 'range');
                if (v === 'any') props.onChange({ minPrice: '', maxPrice: '' });
              }}
              appearance="rail"
              className="gap-0.5 p-[3px]"
              itemClassName="h-7 px-[14px] text-[12px]"
            />
          </ModalField>

          <div className="grid grid-cols-[1fr_16px_1fr] items-end gap-2">
            <ModalField label="MIN PRICE">
              <input
                value={editor.minPrice}
                inputMode="decimal"
                onChange={(e) => props.onChange({ minPrice: e.target.value })}
                className={priceInputClass}
                placeholder="0.50"
                disabled={!isRangeMode}
              />
            </ModalField>
            <span className="pb-[11px] text-center text-[13px] text-ds-text-secondary opacity-50">—</span>
            <ModalField label="MAX PRICE">
              <input
                value={editor.maxPrice}
                inputMode="decimal"
                onChange={(e) => props.onChange({ maxPrice: e.target.value })}
                className={priceInputClass}
                placeholder="1.20"
                disabled={!isRangeMode}
              />
            </ModalField>
          </div>
        </div>

        <div className="border-t border-ds-border pt-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ds-text-secondary">Price Inventory</span>
            <AppButton variant="outline" onClick={props.onLoadPriceOptions} disabled={props.loading}>
              {props.loading ? 'Loading…' : 'Load Prices'}
            </AppButton>
          </div>
          <div className="max-h-[240px] overflow-y-auto rounded-xl border border-ds-border bg-ds-surface-subtle">
            {filteredPriceItems.length > 0 ? filteredPriceItems.map((item) => (
              <div
                key={`${item.country}-${item.operator}-${item.price}`}
                className="flex items-center gap-3 border-b border-ds-border px-4 py-3 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-ds-text-primary">
                    {formatCountryLabel(item.country)} · {item.operator || 'any'}
                  </div>
                  <div className="mt-0.5 text-[11px] text-ds-text-secondary">stock: {item.stock.toLocaleString()}</div>
                </div>
                <div className="w-20 text-right font-mono text-[13px] text-ds-text-secondary">${item.price.toFixed(3)}</div>
                <div className="flex items-center gap-2">
                  <AppButton variant="ghost" size="utility" onClick={() => {
                    props.onQuickFill('min', item.price);
                    setPriceMode('range');
                  }}>Min</AppButton>
                  <AppButton variant="ghost" size="utility" onClick={() => {
                    props.onQuickFill('max', item.price);
                    setPriceMode('range');
                  }}>Max</AppButton>
                </div>
              </div>
            )) : (
              <div className="px-5 py-8 text-center text-[13px] text-ds-text-secondary">
                {props.priceItems.length > 0
                  ? 'No results match the current filters.'
                  : 'No price list loaded. Click Load Prices to fetch prices for this provider and service.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
