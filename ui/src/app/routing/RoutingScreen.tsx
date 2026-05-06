import { GripVertical, Plus } from 'lucide-react';
import { AppButton, PageHeader, SectionHeader, SegmentedControl, StatusBadge, ToggleSwitch } from '../ui-bridge';
import type {
  ProviderDynamicOptions,
  ProviderManifest,
  RoutingExecutionMode,
  RoutingPlan,
  RoutingPlanItem,
  RoutingPriceMode,
} from '../types';
import { formatCountryLabel, formatProviderLabel, formatServiceLabel } from '../../lib/formatters';

export type RoutingScreenProps = {
  plans: RoutingPlan[];
  providers: ProviderManifest[];
  providerOptions: Record<string, ProviderDynamicOptions>;
  serviceOptions: Array<{ id: string; label: string }>;
  selectedPlanId: string;
  onSelectPlan: (planId: string) => void;
  onCreatePlan: () => void;
  onDeletePlan: (planId: string) => void;
  onUpdatePlan: (plan: RoutingPlan) => void;
  onOpenServicePicker: () => void;
  onOpenProviderPicker: (itemId: string) => void;
  onOpenCountryPicker: (itemId: string) => void;
  onOpenOperatorPicker: (itemId: string) => void;
  onOpenPricePicker: (itemId: string) => void;
  onAddItem: () => void;
  onRemoveItem: (itemId: string) => void;
  onMoveItem: (itemId: string, direction: 'up' | 'down') => void;
  onReorderItem: (fromIndex: number, toIndex: number) => void;
  onSavePlan: (plan: RoutingPlan) => void;
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

export function RoutingScreen(props: RoutingScreenProps) {
  const plan = props.plans.find((item) => item.id === props.selectedPlanId) ?? props.plans[0] ?? emptyPlan();
  const enabledItemCount = plan.items.filter((item) => item.enabled).length;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Routing Plans"
        subtitle="Create a matrix of acquisition candidates for one service, then traverse it sequentially or randomly with provider-aware failover."
        actions={(
          <AppButton variant="primary" onClick={props.onCreatePlan}>
            <Plus size={14} />
            New Plan
          </AppButton>
        )}
      />

      <div className="grid grid-cols-1 gap-6 min-[980px]:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="rounded-[24px] border border-ds-border bg-[linear-gradient(180deg,var(--ds-color-surface-subtle)_0%,var(--ds-color-surface-default)_100%)] p-4 shadow-[0_10px_26px_rgba(0,0,0,0.05)]">
          <SectionHeader
            eyebrow="Plans"
            title="Named Strategies"
            description={`Reusable routing presets for API callers. Service catalog: ${props.serviceOptions.length} options.`}
          />
          <div className="mt-4 flex flex-col gap-3">
            {props.plans.length > 0 ? props.plans.map((item) => {
              const active = item.id === plan.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => props.onSelectPlan(item.id)}
                  className={active
                    ? 'rounded-[18px] border border-ds-accent-blue bg-ds-accent-blue-soft px-4 py-3 text-left shadow-[inset_0_0_0_1px_var(--ds-color-accent-blue-soft)]'
                    : 'rounded-[18px] border border-ds-border bg-ds-surface px-4 py-3 text-left'}
                >
                  <div className="flex items-center justify-between gap-3">
                    <strong className="text-[14px] text-ds-text-primary">{item.name}</strong>
                    <StatusBadge tone={item.enabled ? 'green' : 'gray'}>
                      {item.enabled ? 'Enabled' : 'Disabled'}
                    </StatusBadge>
                  </div>
                  <div className="mt-1 text-[12px] text-ds-text-secondary">
                    {formatServiceLabel(item.service || 'service')} · {item.execution_mode === 'random' ? 'Random' : 'Sequential'}
                  </div>
                  <div className="mt-1 text-[11px] text-ds-text-secondary">
                    {item.items.length} item{item.items.length === 1 ? '' : 's'}
                  </div>
                </button>
              );
            }) : (
              <div className="rounded-lg border border-ds-border bg-ds-surface-subtle px-4 py-5 text-center text-[13px] text-ds-text-secondary">
                No routing plans yet.
              </div>
            )}
          </div>
        </aside>

        <section className="rounded-[28px] border border-ds-border bg-[linear-gradient(180deg,var(--ds-color-surface-default)_0%,var(--ds-color-surface-subtle)_100%)] p-6 shadow-[0_14px_34px_rgba(0,0,0,0.07)]">
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-1 gap-4 min-[760px]:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <div className="rounded-[24px] border border-ds-border bg-ds-surface px-5 py-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ds-text-secondary">Plan Snapshot</div>
                <div className="mt-3 text-[24px] font-semibold tracking-[-0.03em] text-ds-text-primary">
                  {plan.name || 'Untitled routing plan'}
                </div>
                <div className="mt-2 text-[13px] leading-[1.5] text-ds-text-secondary">
                  {plan.description || 'Describe who should use this routing matrix and what kind of fallback logic it should follow.'}
                </div>
              </div>
              <div className="rounded-[24px] border border-ds-border bg-ds-surface px-5 py-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ds-text-secondary">Service Axis</div>
                <div className="mt-3 text-[18px] font-semibold tracking-[-0.02em] text-ds-text-primary">
                  {plan.service ? formatServiceLabel(plan.service) : 'Select service'}
                </div>
                <div className="mt-2 text-[12px] text-ds-text-secondary">
                  One plan maps to one service namespace for external callers.
                </div>
              </div>
              <div className="rounded-[24px] border border-ds-border bg-ds-surface px-5 py-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ds-text-secondary">Matrix Health</div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <StatusBadge tone={plan.enabled ? 'green' : 'gray'}>
                    {plan.enabled ? 'Enabled' : 'Disabled'}
                  </StatusBadge>
                  <StatusBadge tone={enabledItemCount > 0 ? 'green' : 'orange'}>
                    {enabledItemCount} active rows
                  </StatusBadge>
                </div>
                <div className="mt-2 text-[12px] text-ds-text-secondary">
                  {plan.execution_mode === 'random'
                    ? 'Random mode keeps one candidate order per ticket, then fails over within that order.'
                    : 'Sequential mode walks rows from top to bottom until a candidate succeeds.'}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 min-[760px]:grid-cols-[minmax(0,1fr)_220px]">
              <div className="flex flex-col gap-2">
                <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ds-text-secondary">Plan Name</label>
                <input
                  value={plan.name}
                  onChange={(event) => props.onUpdatePlan({ ...plan, name: event.target.value })}
                  className="min-h-control rounded-sm border border-ds-border-strong bg-ds-surface px-4 py-[11px] text-utility text-ds-text-primary"
                  placeholder="e.g. OpenGPT Plan 1"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ds-text-secondary">Service</label>
                <button
                  type="button"
                  onClick={props.onOpenServicePicker}
                  className="min-h-control rounded-sm border border-ds-border-strong bg-ds-surface px-4 py-[11px] text-left text-utility text-ds-text-primary"
                >
                  {plan.service ? formatServiceLabel(plan.service) : 'Select service'}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ds-text-secondary">Description</label>
              <textarea
                value={plan.description ?? ''}
                onChange={(event) => props.onUpdatePlan({ ...plan, description: event.target.value })}
                className="min-h-[88px] rounded-sm border border-ds-border-strong bg-ds-surface px-4 py-3 text-[13px] text-ds-text-primary"
                placeholder="Describe who should use this plan and what kind of acquisition path it follows."
              />
            </div>

              <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ds-text-secondary">Execution Mode</span>
                  <SegmentedControl
                    items={[
                      { id: 'sequential', label: 'Sequential' },
                      { id: 'random', label: 'Random' },
                    ]}
                    value={plan.execution_mode as RoutingExecutionMode}
                    onChange={(value) => props.onUpdatePlan({ ...plan, execution_mode: value })}
                    appearance="rail"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ds-text-secondary">Enabled</span>
                  <ToggleSwitch checked={plan.enabled} onChange={(enabled) => props.onUpdatePlan({ ...plan, enabled })} ariaLabel="Toggle routing plan" />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <AppButton variant="outline" onClick={() => props.onDeletePlan(plan.id)} disabled={!plan.id || props.busyAction === 'delete-routing-plan'}>
                  Delete Plan
                </AppButton>
                <AppButton variant="primary" onClick={() => props.onSavePlan(plan)} disabled={props.busyAction === 'save-routing-plan'}>
                  {props.busyAction === 'save-routing-plan' ? 'Saving…' : 'Save Plan'}
                </AppButton>
              </div>
            </div>

            <div className="rounded-[24px] border border-ds-border bg-ds-surface-subtle p-4 shadow-[inset_0_0_0_1px_var(--ds-color-border-default)]">
              <SectionHeader
                eyebrow="Plan Items"
                title="Candidate Matrix"
                description="Each row is one provider-country-operator-price candidate. Together they form the service-level routing grade for this plan."
                actions={(
                  <AppButton variant="outline" size="utility" onClick={props.onAddItem}>
                    <Plus size={14} />
                    Add Item
                  </AppButton>
                )}
              />
              <div className="mt-4 flex flex-col gap-3">
                {plan.items.length > 0 ? plan.items.map((item, index) => (
                  <RoutingPlanItemCard
                    key={item.id}
                    item={item}
                    index={index}
                    provider={props.providers.find((provider) => provider.id === item.provider)}
                    providerOptions={props.providerOptions[item.provider]}
                    onChange={(nextItem) =>
                      props.onUpdatePlan({
                        ...plan,
                        items: plan.items.map((existing) => existing.id === item.id ? nextItem : existing),
                      })}
                    onOpenProviderPicker={() => props.onOpenProviderPicker(item.id)}
                    onOpenCountryPicker={() => props.onOpenCountryPicker(item.id)}
                    onOpenOperatorPicker={() => props.onOpenOperatorPicker(item.id)}
                    onOpenPricePicker={() => props.onOpenPricePicker(item.id)}
                    onRemove={() => props.onRemoveItem(item.id)}
                    onMove={(direction) => props.onMoveItem(item.id, direction)}
                    onDragMove={props.onReorderItem}
                  />
                )) : (
                  <div className="rounded-lg border border-ds-border bg-ds-surface px-4 py-8 text-center text-[13px] text-ds-text-secondary">
                    Add the first candidate row for this plan.
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function RoutingPlanItemCard(props: {
  item: RoutingPlanItem;
  index: number;
  provider?: ProviderManifest;
  providerOptions?: ProviderDynamicOptions;
  onChange: (item: RoutingPlanItem) => void;
  onOpenProviderPicker: () => void;
  onOpenCountryPicker: () => void;
  onOpenOperatorPicker: () => void;
  onOpenPricePicker: () => void;
  onRemove: () => void;
  onMove: (direction: 'up' | 'down') => void;
  onDragMove: (fromIndex: number, toIndex: number) => void;
}) {
  const priceSummary = props.item.price_mode === 'fixed'
    ? props.item.fixed_price != null ? `Fixed $${props.item.fixed_price.toFixed(3)}` : 'Fixed price'
    : props.item.price_mode === 'range'
      ? `${props.item.min_price != null ? `$${props.item.min_price.toFixed(3)}` : 'Min'} → ${props.item.max_price != null ? `$${props.item.max_price.toFixed(3)}` : 'Max'}`
      : 'Any price';

  const priceModeItems: Array<{ id: RoutingPriceMode; label: string }> = [
    { id: 'any', label: 'Any' },
    { id: 'range', label: 'Range' },
    { id: 'fixed', label: 'Fixed' },
  ];

  return (
    <div className="rounded-[20px] border border-ds-border bg-ds-surface p-4 shadow-[0_6px_18px_rgba(0,0,0,0.05)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2">
          <GripVertical size={16} className="opacity-40" />
          <strong className="text-[13px] text-ds-text-primary">Row {props.index + 1}</strong>
          <StatusBadge tone={props.item.enabled ? 'green' : 'gray'}>
            {props.item.enabled ? 'Active' : 'Disabled'}
          </StatusBadge>
        </div>
        <div className="inline-flex items-center gap-2">
          <ToggleSwitch checked={props.item.enabled} onChange={(enabled) => props.onChange({ ...props.item, enabled })} ariaLabel={`Toggle row ${props.index + 1}`} />
          <AppButton variant="ghost" size="utility" onClick={() => props.onMove('up')}>Up</AppButton>
          <AppButton variant="ghost" size="utility" onClick={() => props.onMove('down')}>Down</AppButton>
          <AppButton variant="ghost" size="utility" onClick={props.onRemove}>Remove</AppButton>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 min-[760px]:grid-cols-4">
        <button type="button" draggable onDragStart={(event) => event.dataTransfer.setData('text/plain', String(props.index))} onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
          event.preventDefault();
          const fromIndex = Number(event.dataTransfer.getData('text/plain'));
          if (!Number.isNaN(fromIndex)) props.onDragMove(fromIndex, props.index);
        }} onClick={props.onOpenProviderPicker} className="rounded-[16px] border border-ds-border bg-ds-surface-subtle px-4 py-4 text-left">
          <div className="text-[11px] uppercase tracking-[0.08em] text-ds-text-secondary">Provider</div>
          <div className="mt-2 text-[14px] font-semibold text-ds-text-primary">{props.provider ? formatProviderLabel(props.provider.name) : 'Select provider'}</div>
          <div className="mt-1 text-[12px] text-ds-text-secondary">{props.provider?.kind ?? 'Provider credential source'}</div>
        </button>
        <button type="button" onClick={props.onOpenCountryPicker} className="rounded-[16px] border border-ds-border bg-ds-surface-subtle px-4 py-4 text-left">
          <div className="text-[11px] uppercase tracking-[0.08em] text-ds-text-secondary">Country</div>
          <div className="mt-2 text-[14px] font-semibold text-ds-text-primary">{props.item.country ? formatCountryLabel(props.item.country) : 'Any country'}</div>
          <div className="mt-1 text-[12px] text-ds-text-secondary">Target territory filter</div>
        </button>
        <button type="button" onClick={props.onOpenOperatorPicker} className="rounded-[16px] border border-ds-border bg-ds-surface-subtle px-4 py-4 text-left">
          <div className="text-[11px] uppercase tracking-[0.08em] text-ds-text-secondary">Operator</div>
          <div className="mt-2 text-[14px] font-semibold text-ds-text-primary">{props.item.operator || 'Any operator'}</div>
          <div className="mt-1 text-[12px] text-ds-text-secondary">Carrier preference filter</div>
        </button>
        <button type="button" onClick={props.onOpenPricePicker} className="rounded-[16px] border border-ds-border bg-ds-surface-subtle px-4 py-4 text-left">
          <div className="text-[11px] uppercase tracking-[0.08em] text-ds-text-secondary">Price</div>
          <div className="mt-2 text-[14px] font-semibold text-ds-text-primary">{priceSummary}</div>
          <div className="mt-1 text-[12px] text-ds-text-secondary">Loaded from provider inventory rows</div>
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-3 rounded-[16px] border border-ds-border bg-ds-surface-subtle px-4 py-4">
        <div className="flex flex-wrap items-center gap-3 text-[12px] text-ds-text-secondary">
          <span>Service options: {props.providerOptions?.services.length ?? 0}</span>
          <span>Country options: {props.providerOptions?.countries.length ?? 0}</span>
          <span>Operator options: {props.providerOptions?.operators.length ?? 0}</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ds-text-secondary">Price Mode</span>
          <SegmentedControl
            items={priceModeItems}
            value={props.item.price_mode}
            onChange={(value) => {
              if (value === 'any') {
                props.onChange({
                  ...props.item,
                  price_mode: 'any',
                  min_price: null,
                  max_price: null,
                  fixed_price: null,
                });
                return;
              }
              if (value === 'fixed') {
                const fixedValue = props.item.fixed_price ?? props.item.min_price ?? props.item.max_price ?? null;
                props.onChange({
                  ...props.item,
                  price_mode: 'fixed',
                  min_price: fixedValue,
                  max_price: fixedValue,
                  fixed_price: fixedValue,
                });
                return;
              }
              props.onChange({
                ...props.item,
                price_mode: 'range',
                fixed_price: null,
              });
            }}
            appearance="rail"
          />
          <AppButton variant="outline" size="utility" onClick={props.onOpenPricePicker}>
            Load Price Row
          </AppButton>
        </div>
      </div>
    </div>
  );
}
