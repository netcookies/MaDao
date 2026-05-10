import { useEffect, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronRight, Copy, GripVertical, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../../components/overlays';
import { formatCountryLabel, formatProviderLabel, formatServiceLabel } from '../../lib/formatters';
import { formatOperatorLabel } from '../utils';
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
import { ResourceBadge } from '../../components/primitives';
import type {
  ProviderManifest,
  ProviderPriceItem,
  LanguageCode,
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
  serviceOptions: Array<{ id: string; label: string }>;
  serviceIconUrls?: Record<string, string>;
  countryIconUrls?: Record<string, string>;
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
  onOpenItemSelector: (itemId: string, field: 'provider' | 'country' | 'operator', source?: 'row' | 'editor') => void;
  onAddItem: () => void;
  onDuplicateItem: (itemId: string) => void;
  onRemoveItem: (itemId: string) => void;
  onReorderItem: (fromIndex: number, toIndex: number) => void;
  onOpenItemEditor: (itemId: string) => void;
  onCloseItemEditor: () => void;
  onItemEditorChange: (patch: Partial<RoutingItemEditorState>) => void;
  onApplyItemEditor: () => void;
  onLoadItemPriceOptions: () => void;
  onUseItemPriceQuickFill: (kind: 'min' | 'max', price: number) => void;
  onUseItemExactPrice: (price: number) => void;
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

function summarizePrice(item: RoutingPlanItem, t: (key: string) => string) {
  if (item.price_mode === 'fixed' && item.fixed_price != null) {
    return `$${item.fixed_price.toFixed(3)} ${t('fixed')}`;
  }
  if (item.min_price != null || item.max_price != null) {
    return `${item.min_price != null ? `$${item.min_price.toFixed(3)}` : t('Min')} - ${item.max_price != null ? `$${item.max_price.toFixed(3)}` : t('Max')}`;
  }
  return t('No price limit');
}

export function RoutingScreen(props: RoutingScreenProps) {
  const { i18n } = useTranslation();
  const language = (i18n.resolvedLanguage ?? i18n.language ?? 'en') as LanguageCode;
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
        serviceIconUrls={props.serviceIconUrls}
        countryIconUrls={props.countryIconUrls}
        language={language}
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
        serviceOptions={props.serviceOptions}
        serviceIconUrls={props.serviceIconUrls}
        countryIconUrls={props.countryIconUrls}
        language={language}
        busyAction={props.busyAction}
        onBackToList={props.onBackToList}
        onDeletePlan={props.onDeletePlan}
        onUpdatePlan={props.onUpdatePlan}
        onOpenServicePicker={props.onOpenServicePicker}
        onAddItem={props.onAddItem}
        onDuplicateItem={props.onDuplicateItem}
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
        language={language}
        countryIconUrls={props.countryIconUrls}
        priceItems={props.itemPriceOptions}
        loading={props.itemEditorLoading}
        onClose={props.onCloseItemEditor}
        onChange={props.onItemEditorChange}
        onOpenSelector={(field) => props.itemEditor && props.onOpenItemSelector(props.itemEditor.itemId, field, 'editor')}
        onApply={props.onApplyItemEditor}
        onLoadPriceOptions={props.onLoadItemPriceOptions}
        onQuickFill={props.onUseItemPriceQuickFill}
        onUseExactPrice={props.onUseItemExactPrice}
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
  serviceIconUrls?: Record<string, string>;
  countryIconUrls?: Record<string, string>;
  language: 'en' | 'zh';
  routingFilter: RoutingPlanFilter;
  routingSearch: string;
  onCreatePlan: () => void;
  onSelectPlan: (planId: string) => void;
  onTogglePlan: (plan: RoutingPlan, enabled: boolean) => void;
  onUpdateRoutingFilter: (value: RoutingPlanFilter) => void;
  onUpdateRoutingSearch: (value: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('Routing Plans')}
        subtitle={t('Browse reusable routing plans and open any plan to manage its candidates.')}
      />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <span className="text-[13px] text-ds-text-secondary">
          {props.plans.length} {props.plans.length === 1 ? t('plan') : t('plans')}
        </span>
        <SegmentedControl
          items={[
            { id: 'all', label: t('All') },
            { id: 'enabled', label: t('Active') },
            { id: 'disabled', label: t('Inactive') },
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
                    {plan.name || t('Untitled Plan')}
                  </span>
                </div>
                <StatusBadge tone={!plan.id ? 'orange' : plan.enabled ? 'green' : 'gray'}>
                  {!plan.id ? t('Draft') : plan.enabled ? t('Enabled') : t('Disabled')}
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
                  {plan.service ? (
                    <span className="inline-flex items-center gap-2">
                      <ResourceBadge kind="service" value={plan.service} size="sm" iconUrl={props.serviceIconUrls?.[plan.service]} />
                      <span>{formatServiceLabel(plan.service, props.language)}</span>
                    </span>
                  ) : t('No Service')}
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
                {plan.description || t('No description yet. Add context so this route is easier to maintain later.')}
              </p>

              <div className="mt-5 flex items-center justify-between text-[12px] text-ds-text-secondary">
                <span>
                  {plan.items.length} {plan.items.length === 1 ? t('candidate') : t('candidates')}
                </span>
                <span className="inline-flex items-center gap-1 text-ds-accent-blue">
                  {t('Manage')}
                  <ChevronRight size={12} className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-ds-border bg-ds-surface px-6 py-12 text-center text-[14px] text-ds-text-secondary shadow-ds backdrop-blur-ds">
          {t('No plans match the current filters.')}
        </div>
      )}
    </div>
  );
}

function RoutingPlanDetailScreen(props: {
  plan: RoutingPlan;
  providers: ProviderManifest[];
  serviceOptions: Array<{ id: string; label: string }>;
  serviceIconUrls?: Record<string, string>;
  countryIconUrls?: Record<string, string>;
  language: 'en' | 'zh';
  busyAction: string;
  onBackToList: () => void;
  onDeletePlan: (planId: string) => void;
  onUpdatePlan: (plan: RoutingPlan) => void;
  onOpenServicePicker: () => void;
  onAddItem: () => void;
  onDuplicateItem: (itemId: string) => void;
  onRemoveItem: (itemId: string) => void;
  onReorderItem: (fromIndex: number, toIndex: number) => void;
  onOpenProviderPicker: (itemId: string) => void;
  onOpenItemSelector: (itemId: string, field: 'provider' | 'country' | 'operator', source?: 'row' | 'editor') => void;
  onOpenItemEditor: (itemId: string) => void;
}) {
  const { t } = useTranslation();
  const toggleLabel = props.plan.enabled ? t('Enabled') : t('Disabled');
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [overItemId, setOverItemId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
  );

  useEffect(() => {
    setActiveItemId(null);
    setOverItemId(null);
  }, [props.plan.id, props.plan.items.length]);

  function handleDragStart(event: DragStartEvent) {
    const itemId = String(event.active.id);
    setActiveItemId(itemId);
    setOverItemId(itemId);
  }

  function handleDragOver(event: DragOverEvent) {
    setOverItemId(event.over ? String(event.over.id) : null);
  }

  function resetDraggingState() {
    setActiveItemId(null);
    setOverItemId(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      resetDraggingState();
      return;
    }

    const fromIndex = props.plan.items.findIndex((item) => item.id === String(active.id));
    const toIndex = props.plan.items.findIndex((item) => item.id === String(over.id));

    if (fromIndex >= 0 && toIndex >= 0 && fromIndex !== toIndex) {
      props.onReorderItem(fromIndex, toIndex);
    }
    resetDraggingState();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 min-[860px]:flex-row min-[860px]:items-start min-[860px]:justify-between">
        <div className="flex flex-col gap-[3px]">
          <h1 className="m-0 text-[20px] font-semibold leading-none tracking-[-0.3px] text-ds-text-primary">
            {props.plan.name || t('Untitled Plan')}
          </h1>
          <p className="m-0 text-[13px] leading-none text-ds-text-secondary opacity-50">
            {t('Manage service matching, execution order, and candidate availability for this routing plan.')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <AppButton
            variant="danger-outline"
            size="utility"
            onClick={() => props.onDeletePlan(props.plan.id)}
            disabled={!props.plan.id || props.busyAction === 'delete-routing-plan'}
          >
            {props.busyAction === 'delete-routing-plan' ? t('Deleting...') : t('Delete Plan')}
          </AppButton>
        </div>
      </div>

      <section className="rounded-2xl border border-ds-border bg-ds-surface p-6 shadow-ds backdrop-blur-ds">
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between gap-4">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ds-text-secondary">
              {t('Plan Details')}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-ds-text-primary">
                {toggleLabel}
              </span>
              <ToggleSwitch
                checked={props.plan.enabled}
                onChange={(enabled) => props.onUpdatePlan({ ...props.plan, enabled })}
                ariaLabel={t('Toggle routing plan')}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 min-[760px]:grid-cols-[minmax(0,1fr)_200px]">
            <label className="flex flex-col gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ds-text-secondary">
                {t('Name')}
              </span>
              <input
                value={props.plan.name}
                onChange={(event) => props.onUpdatePlan({ ...props.plan, name: event.target.value })}
                className="min-h-control w-full rounded-[10px] border border-ds-border-strong bg-ds-surface px-4 py-[11px] text-utility text-ds-text-primary"
                placeholder={t('OpenAI Primary Route')}
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ds-text-secondary">
                {t('Service')}
              </span>
              <SelectTrigger
                value={props.plan.service ? formatServiceLabel(props.plan.service, props.language) : ''}
                valueContent={props.plan.service ? (
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <ResourceBadge kind="service" value={props.plan.service} size="sm" iconUrl={props.serviceIconUrls?.[props.plan.service]} />
                    <span className="truncate">{formatServiceLabel(props.plan.service, props.language)}</span>
                  </span>
                ) : undefined}
                placeholder={t('Choose service')}
                onClick={props.onOpenServicePicker}
                className="w-full"
              />
            </label>
          </div>

          <label className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ds-text-secondary">
              {t('Description')}
            </span>
            <textarea
              value={props.plan.description ?? ''}
              onChange={(event) => props.onUpdatePlan({ ...props.plan, description: event.target.value })}
              className="min-h-[80px] w-full rounded-[10px] border border-ds-border-strong bg-ds-surface px-4 py-3 text-[13px] text-ds-text-primary"
              placeholder={t('Describe when this plan should be used and what kind of candidates it should prefer.')}
            />
          </label>

          <div className="flex flex-col gap-4 min-[760px]:flex-row min-[760px]:items-end min-[760px]:justify-between">
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ds-text-secondary">
                {t('Execution Mode')}
              </span>
              <SegmentedControl
                items={[
                  { id: 'sequential', label: t('Sequential') },
                  { id: 'random', label: t('Random') },
                ]}
                value={props.plan.execution_mode as RoutingExecutionMode}
                onChange={(value) => props.onUpdatePlan({ ...props.plan, execution_mode: value })}
                appearance="rail"
                className="flex-nowrap"
              />
            </div>

            <div className="min-[760px]:text-right">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ds-text-secondary">
                {t('Plan ID')}
              </div>
              <div className="mt-1 break-all font-mono text-[11px] text-ds-text-secondary">
                {props.plan.id || t('Save to generate an id')}
              </div>
            </div>
          </div>

        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 min-[760px]:flex-row min-[760px]:items-center min-[760px]:justify-between">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <h2 className="m-0 text-[14px] font-semibold text-ds-text-primary">{t('Route Candidates')}</h2>
              <span className="inline-flex items-center rounded-pill bg-ds-surface-subtle px-2.5 py-1 text-[12px] font-semibold text-ds-text-secondary">
                {props.plan.items.length}
              </span>
            </div>
            <p className="m-0 text-[12px] text-ds-text-secondary">
              {t('Drag candidates to reorder. Save Changes to persist.')}
            </p>
          </div>
          <AppButton variant="outline" size="utility" onClick={props.onAddItem}>
            <Plus size={14} />
            {t('Add Candidate')}
          </AppButton>
        </div>

        <div className="overflow-hidden rounded-2xl border border-ds-border bg-ds-surface shadow-ds backdrop-blur-ds">
          <div className="hidden min-[900px]:grid min-[900px]:grid-cols-[28px_28px_100px_minmax(0,1fr)_80px_124px_84px] min-[900px]:items-center min-[900px]:gap-x-2 bg-ds-surface-subtle px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ds-text-secondary">
            <span />
            <span>#</span>
            <span>{t('Provider')}</span>
            <span>{t('Country')}</span>
            <span>{t('Operator')}</span>
            <span>{t('Price Range')}</span>
            <span className="text-right">{t('Actions')}</span>
          </div>

          {props.plan.items.length > 0 ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis, restrictToParentElement]}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              onDragCancel={resetDraggingState}
            >
              <SortableContext items={props.plan.items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
                {props.plan.items.map((item, index) => (
                  <SortableRoutingPlanItemRow
                    key={item.id}
                    item={item}
                    index={index}
                    providers={props.providers}
                    countryIconUrls={props.countryIconUrls}
                    language={props.language}
                    activeItemId={activeItemId}
                    overItemId={overItemId}
                    onOpenProviderPicker={props.onOpenProviderPicker}
                    onOpenItemSelector={props.onOpenItemSelector}
                    onDuplicateItem={props.onDuplicateItem}
                    onOpenItemEditor={props.onOpenItemEditor}
                    onRemoveItem={props.onRemoveItem}
                  />
                ))}
              </SortableContext>
            </DndContext>
          ) : (
            <div className="px-5 py-10 text-center text-[13px] text-ds-text-secondary">
              {t('No candidates yet. Add a candidate to start building this route.')}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function SortableRoutingPlanItemRow(props: {
  item: RoutingPlanItem;
  index: number;
  providers: ProviderManifest[];
  countryIconUrls?: Record<string, string>;
  language: 'en' | 'zh';
  activeItemId: string | null;
  overItemId: string | null;
  onOpenProviderPicker: (itemId: string) => void;
  onOpenItemSelector: (itemId: string, field: 'provider' | 'country' | 'operator', source?: 'row' | 'editor') => void;
  onDuplicateItem: (itemId: string) => void;
  onOpenItemEditor: (itemId: string) => void;
  onRemoveItem: (itemId: string) => void;
}) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.item.id });
  const provider = props.providers.find((entry) => entry.id === props.item.provider);
  const providerLabel = props.item.provider === 'any'
    ? t('Any provider')
    : provider
      ? formatProviderLabel(provider.name, props.language)
      : t('Choose provider');
  const countryLabel = props.item.country ? formatCountryLabel(props.item.country, props.language) : t('Any country');
  const operatorLabel = formatOperatorLabel(props.item.operator || 'any', props.language);
  const isDropTarget = props.overItemId === props.item.id && props.activeItemId !== props.item.id;

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cx(
        'grid grid-cols-[32px_minmax(0,1fr)_auto] gap-3 border-b border-ds-border px-4 py-3 last:border-b-0 min-[900px]:grid-cols-[28px_28px_100px_minmax(0,1fr)_80px_124px_84px] min-[900px]:items-center min-[900px]:gap-x-2',
        props.item.enabled ? 'bg-ds-surface' : 'bg-ds-surface opacity-60',
        isDropTarget && 'border-t-2 border-t-ds-accent-blue',
        isDragging && 'z-10 opacity-45 shadow-ds',
      )}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className="flex h-8 w-8 cursor-grab touch-none select-none items-center justify-center rounded-[8px] text-ds-text-secondary transition-colors duration-fast ease-[var(--ds-motion-transition-fast)] hover:bg-ds-surface-subtle hover:text-ds-accent-blue active:cursor-grabbing min-[900px]:justify-center"
        aria-label={t('Drag candidate {{index}}', { index: props.index + 1 })}
        title={t('Drag candidate {{index}}', { index: props.index + 1 })}
      >
        <GripVertical size={14} className="opacity-30" />
      </button>

      <div className="hidden text-[13px] text-ds-text-secondary min-[900px]:block">
        {props.index + 1}
      </div>

      <div className="min-w-0">
        <button
          type="button"
          onClick={() => props.onOpenProviderPicker(props.item.id)}
          className="inline-flex w-full min-w-0 items-center gap-2 bg-transparent p-0 text-left text-[13px] font-medium text-ds-text-primary transition-colors duration-fast ease-[var(--ds-motion-transition-fast)] hover:text-ds-accent-blue"
        >
          <ResourceBadge kind="provider" value={props.item.provider} size="sm" />
          <span className="truncate">{providerLabel}</span>
        </button>
        <div className="mt-1 flex flex-wrap gap-3 text-[12px] text-ds-text-secondary min-[900px]:hidden">
          <span>#{props.index + 1}</span>
          <button
            type="button"
            onClick={() => props.onOpenItemSelector(props.item.id, 'country', 'row')}
            className="inline-flex min-w-0 items-center gap-1 bg-transparent p-0 text-left text-inherit hover:text-ds-accent-blue"
          >
            <ResourceBadge kind="country" value={props.item.country || 'any'} size="sm" iconUrl={props.countryIconUrls?.[props.item.country || 'any']} />
            <span className="truncate">{countryLabel}</span>
          </button>
          <button
            type="button"
            onClick={() => props.onOpenItemSelector(props.item.id, 'operator', 'row')}
            className="inline-flex min-w-0 items-center gap-1 bg-transparent p-0 text-left text-inherit hover:text-ds-accent-blue"
          >
            <span className="truncate">{operatorLabel}</span>
          </button>
          <span>{summarizePrice(props.item, t)}</span>
          {!props.item.enabled ? <span>{t('Disabled')}</span> : null}
        </div>
      </div>

      <div className="hidden min-[900px]:block">
        <button
          type="button"
          onClick={() => props.onOpenItemSelector(props.item.id, 'country', 'row')}
          className="inline-flex w-full min-w-0 items-center gap-2 bg-transparent p-0 text-left text-[12px] text-ds-text-secondary transition-colors duration-fast ease-[var(--ds-motion-transition-fast)] hover:text-ds-accent-blue"
        >
          <ResourceBadge kind="country" value={props.item.country || 'any'} size="sm" iconUrl={props.countryIconUrls?.[props.item.country || 'any']} />
          <span className="truncate">{countryLabel}</span>
        </button>
      </div>

      <div className="hidden min-[900px]:block">
        <button
          type="button"
          onClick={() => props.onOpenItemSelector(props.item.id, 'operator', 'row')}
          className="inline-flex w-full min-w-0 items-center gap-2 bg-transparent p-0 text-left text-[12px] text-ds-text-secondary transition-colors duration-fast ease-[var(--ds-motion-transition-fast)] hover:text-ds-accent-blue"
        >
          <span className="truncate">{operatorLabel}</span>
        </button>
      </div>

      <div className="hidden text-[12px] text-ds-text-secondary min-[900px]:block">
        {summarizePrice(props.item, t)}
      </div>

      <div className="flex items-center justify-end gap-2.5">
        <button
          type="button"
          onClick={() => props.onDuplicateItem(props.item.id)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] text-ds-text-secondary transition-colors duration-fast ease-[var(--ds-motion-transition-fast)] hover:bg-ds-surface-subtle hover:text-ds-accent-blue"
          aria-label={t('Duplicate candidate {{index}}', { index: props.index + 1 })}
          title={t('Duplicate candidate')}
        >
          <Copy size={14} />
        </button>
        <button
          type="button"
          onClick={() => props.onOpenItemEditor(props.item.id)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] text-ds-accent-blue transition-colors duration-fast ease-[var(--ds-motion-transition-fast)] hover:bg-ds-surface-subtle"
          aria-label={t('Edit candidate {{index}}', { index: props.index + 1 })}
          title={t('Edit candidate')}
        >
          <RoutingPencilIcon />
        </button>
        <button
          type="button"
          onClick={() => props.onRemoveItem(props.item.id)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] text-[rgb(224,68,62)] transition-colors duration-fast ease-[var(--ds-motion-transition-fast)] hover:bg-ds-surface-subtle"
          aria-label={t('Delete candidate {{index}}', { index: props.index + 1 })}
          title={t('Delete candidate')}
        >
          <RoutingTrashIcon />
        </button>
      </div>
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
  language: 'en' | 'zh';
  countryIconUrls?: Record<string, string>;
  priceItems: ProviderPriceItem[];
  loading: boolean;
  onClose: () => void;
  onChange: (patch: Partial<RoutingItemEditorState>) => void;
  onOpenSelector: (field: 'provider' | 'country' | 'operator') => void;
  onApply: () => void;
  onLoadPriceOptions: () => void;
  onQuickFill: (kind: 'min' | 'max', price: number) => void;
  onUseExactPrice: (price: number) => void;
}) {
  const { t } = useTranslation();
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

  const providerLabel = editor.providerId === 'any'
    ? t('Any provider')
    : props.providers.find((provider) => provider.id === editor.providerId)?.name ?? editor.providerId;
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
      title={t('Edit Route Candidate')}
      onClose={props.onClose}
      footer={(
        <>
          <AppButton variant="outline" onClick={props.onClose}>{t('Cancel')}</AppButton>
          <AppButton variant="primary" size="utility" onClick={props.onApply}>{t('Save Changes')}</AppButton>
        </>
      )}
    >
      <div className="flex flex-col gap-4 px-5 py-4">
        <div className="grid grid-cols-1 gap-3 min-[580px]:grid-cols-3">
          <ModalField label={t('PROVIDER')}>
            <SelectTrigger
              compact
              value={providerLabel ? formatProviderLabel(providerLabel, props.language) : ''}
              valueContent={providerLabel ? (
                <span className="inline-flex min-w-0 items-center gap-2">
                  <ResourceBadge kind="provider" value={editor.providerId} size="sm" />
                  <span className="truncate">{formatProviderLabel(providerLabel, props.language)}</span>
                </span>
              ) : undefined}
              placeholder={t('Select provider')}
              onClick={() => props.onOpenSelector('provider')}
              className="w-full"
            />
          </ModalField>
          <ModalField label={t('COUNTRY')}>
            <SelectTrigger
              compact
              value={editor.country ? formatCountryLabel(editor.country, props.language) : ''}
              valueContent={editor.country ? (
                <span className="inline-flex min-w-0 items-center gap-2">
                  <ResourceBadge kind="country" value={editor.country} size="sm" iconUrl={props.countryIconUrls?.[editor.country]} />
                  <span className="truncate">{formatCountryLabel(editor.country, props.language)}</span>
                </span>
              ) : undefined}
              placeholder={t('Any country')}
              onClick={() => props.onOpenSelector('country')}
              className="w-full"
            />
          </ModalField>
          <ModalField label={t('CARRIER')}>
            <SelectTrigger
              compact
              value={editor.operator ? formatOperatorLabel(editor.operator, props.language) : ''}
              placeholder={t('Any carrier')}
              onClick={() => props.onOpenSelector('operator')}
              className="w-full"
            />
          </ModalField>
        </div>

        <div className="grid grid-cols-1 gap-3 min-[680px]:grid-cols-[auto_minmax(0,1fr)] min-[680px]:items-end">
          <ModalField label={t('PRICE MODE')}>
            <SegmentedControl
              items={[{ id: 'any', label: t('any') }, { id: 'range', label: t('Range') }]}
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
            <ModalField label={t('MIN PRICE')}>
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
            <ModalField label={t('MAX PRICE')}>
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
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ds-text-secondary">{t('Price Inventory')}</span>
            <AppButton variant="outline" onClick={props.onLoadPriceOptions} disabled={props.loading}>
              {props.loading ? t('Loading…') : t('Load Prices')}
            </AppButton>
          </div>
          <div className="max-h-[240px] overflow-y-auto rounded-xl border border-ds-border bg-ds-surface-subtle">
            {filteredPriceItems.length > 0 ? filteredPriceItems.map((item) => (
              <div
                key={`${item.country}-${item.operator}-${item.price}`}
                className="flex items-center gap-3 border-b border-ds-border px-4 py-3 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="inline-flex min-w-0 items-center gap-2 truncate text-[13px] font-medium text-ds-text-primary">
                    <ResourceBadge kind="country" value={item.country} size="sm" iconUrl={props.countryIconUrls?.[item.country]} />
                    <span className="truncate">
                      {formatCountryLabel(item.country, props.language)} · {item.operator_label || formatOperatorLabel(item.operator || 'any', props.language)}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-ds-text-secondary">
                    {t('stock')}: {item.stock.toLocaleString()}
                  </div>
                </div>
                <div className="w-20 text-right font-mono text-[13px] text-ds-text-secondary">${item.price.toFixed(3)}</div>
                <div className="flex items-center gap-2">
                  <AppButton variant="ghost" size="utility" onClick={() => {
                    props.onUseExactPrice(item.price);
                    setPriceMode('range');
                  }}>{t('Use exact')}</AppButton>
                  <AppButton variant="ghost" size="utility" onClick={() => {
                    props.onQuickFill('min', item.price);
                    setPriceMode('range');
                  }}>{t('Min')}</AppButton>
                  <AppButton variant="ghost" size="utility" onClick={() => {
                    props.onQuickFill('max', item.price);
                    setPriceMode('range');
                  }}>{t('Max')}</AppButton>
                </div>
              </div>
            )) : (
              <div className="px-5 py-8 text-center text-[13px] text-ds-text-secondary">
                {props.priceItems.length > 0
                  ? t('No results match the current filters.')
                  : t('No price list loaded. Click Load Prices to fetch prices for this provider and service.')}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
