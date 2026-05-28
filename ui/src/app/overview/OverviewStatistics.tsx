import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../../components/overlays';
import { ResourceBadge } from '../../components/primitives';
import { cx } from '../../lib/cx';
import { AppButton, SearchField } from '../ui-bridge';

export type LookbackPeriod = '24h' | '3d' | '7d';

export type ServiceStats = {
  service: string;
  serviceLabel: string;
  serviceIconUrl?: string | null;
  totalAttempts: number;
  successCount: number;
  failCount: number;
};

export type RouteRankCard = {
  country: string;
  countryLabel: string;
  countryIconUrl?: string | null;
  provider: string;
  providerLabel: string;
  providerIconUrl?: string | null;
  providerBadgeLabel?: string | null;
  route: string;
  routeLabel: string;
  value: string;
  rank: number;
};

export type OverviewStatisticsProps = {
  services: ServiceStats[];
  bestRoutes: RouteRankCard[];
  cheapestRoutes: RouteRankCard[];
  fastestRoutes: RouteRankCard[];
  selectedService: string;
  selectedServiceLabel: string;
  onServiceSelect: (service: string) => void;
  lookback: LookbackPeriod;
  onLookbackChange: (period: LookbackPeriod) => void;
  loading?: boolean;
  layout?: 'app' | 'web';
};

const LOOKBACK_OPTIONS: LookbackPeriod[] = ['24h', '3d', '7d'];
type RouteGroupId = 'best' | 'cheapest' | 'fastest';

export function OverviewStatistics(props: OverviewStatisticsProps) {
  const { t } = useTranslation();
  const [serviceSearch, setServiceSearch] = useState('');
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [activeRouteGroup, setActiveRouteGroup] = useState<RouteGroupId>('best');
  const layout = props.layout ?? 'web';

  if (props.loading) {
    return (
      <OverviewStatisticsSkeleton
        lookback={props.lookback}
        layout={layout}
        onLookbackChange={props.onLookbackChange}
      />
    );
  }

  const serviceCards = props.services.slice(0, 5);
  if (
    props.selectedService
    && !serviceCards.some((service) => service.service === props.selectedService)
  ) {
    const selectedService = props.services.find((service) => service.service === props.selectedService);
    if (selectedService) serviceCards.splice(Math.max(0, serviceCards.length - 1), 1, selectedService);
  }
  const normalizedSearch = serviceSearch.trim().toLowerCase();
  const filteredServices = normalizedSearch
    ? props.services.filter((service) => (
      service.serviceLabel.toLowerCase().includes(normalizedSearch)
      || service.service.toLowerCase().includes(normalizedSearch)
    ))
    : props.services;
  const routeGroupOptions: Array<{ id: RouteGroupId; title: string; cards: RouteRankCard[]; valueColor: string }> = [
    { id: 'best', title: t('Best Routes'), cards: props.bestRoutes, valueColor: 'text-ds-state-success' },
    { id: 'cheapest', title: t('Cheapest Routes'), cards: props.cheapestRoutes, valueColor: 'text-[var(--ds-color-accent,#007aff)]' },
    { id: 'fastest', title: t('Fastest Routes'), cards: props.fastestRoutes, valueColor: 'text-[var(--ds-color-accent,#007aff)]' },
  ];
  const routeGroups = routeGroupOptions.filter((group) => group.cards.length > 0);
  const visibleRouteGroup = routeGroups.find((group) => group.id === activeRouteGroup) ?? routeGroups[0];

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 min-[760px]:flex-row min-[760px]:items-center min-[760px]:justify-between">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-[13px] font-semibold text-ds-text-primary/70">{t('Popular Services')}</span>
            <span className="text-[12px] text-ds-text-primary/45">{t('Click a card below to switch')}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <LookbackSegment value={props.lookback} onChange={props.onLookbackChange} />
            <AppButton
              variant="outline"
              size="utility"
              onClick={() => setServiceModalOpen(true)}
              disabled={props.services.length === 0}
            >
              <SlidersHorizontal size={12} className="opacity-50" />
              <span className="ml-1.5">{t('More Services')}</span>
            </AppButton>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2.5 min-[760px]:grid-cols-5">
          {serviceCards.map((svc) => (
            <ServiceCard
              key={svc.service}
              service={svc}
              selected={svc.service === props.selectedService}
              onClick={() => props.onServiceSelect(svc.service)}
            />
          ))}
        </div>
      </div>

      {layout === 'app' && routeGroups.length > 0 ? (
        <div className="flex flex-col gap-3">
          <RouteTabs
            groups={routeGroups.map((group) => ({ id: group.id, title: group.title }))}
            active={visibleRouteGroup?.id ?? 'best'}
            onChange={setActiveRouteGroup}
          />
          {visibleRouteGroup ? (
            <RouteRankSection
              title={visibleRouteGroup.title}
              suffix={props.selectedServiceLabel}
              cards={visibleRouteGroup.cards}
              valueColor={visibleRouteGroup.valueColor}
              showTitle={false}
            />
          ) : null}
        </div>
      ) : (
        routeGroups.map((group) => (
          <RouteRankSection
            key={group.id}
            title={group.title}
            suffix={props.selectedServiceLabel}
            cards={group.cards}
            valueColor={group.valueColor}
          />
        ))
      )}

      <ServicePickerModal
        open={serviceModalOpen}
        services={filteredServices}
        search={serviceSearch}
        selectedService={props.selectedService}
        onSearch={setServiceSearch}
        onClose={() => setServiceModalOpen(false)}
        onSelect={(service) => {
          props.onServiceSelect(service.service);
          setServiceModalOpen(false);
        }}
      />
    </div>
  );
}

function LookbackSegment(props: { value: LookbackPeriod; onChange: (v: LookbackPeriod) => void }) {
  return (
    <div className="flex items-center rounded-md border border-ds-border bg-ds-surface-subtle p-0.5">
      {LOOKBACK_OPTIONS.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => props.onChange(opt)}
          className={`cursor-pointer rounded-[5px] border-0 px-3 py-1 text-[12px] font-medium transition-colors ${
            opt === props.value
              ? 'bg-[var(--ds-color-card-surface)] text-ds-text-primary shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
              : 'bg-transparent text-ds-text-primary/50 hover:text-ds-text-primary/70'
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function ServiceCard(props: { service: ServiceStats; selected: boolean; onClick: () => void }) {
  const { t } = useTranslation();
  const { service, selected, onClick } = props;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'flex min-h-[88px] cursor-pointer flex-col justify-between gap-3 rounded-[8px] border bg-[var(--ds-color-card-surface)] p-3 text-left shadow-[0_2px_2px_rgba(0,0,0,0.06)] backdrop-blur-ds transition-colors',
        selected
          ? 'border-[var(--ds-color-accent,#007aff)] border-[1.5px] bg-ds-accent-soft ring-1 ring-[var(--ds-color-accent,#007aff)]'
          : 'border-[var(--ds-color-card-border)] hover:border-ds-border-strong',
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <ResourceBadge
          kind="service"
          value={service.service}
          iconUrl={service.serviceIconUrl}
          className="h-7 w-7 rounded-[8px] p-[5px]"
        />
        <span className="min-w-0 truncate text-[12px] font-semibold text-ds-text-primary">{service.serviceLabel}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-ds-text-primary/60">{t('attempts_count', { count: service.totalAttempts })}</span>
        <span className="flex items-center gap-1 text-[11px]">
          <span className="font-semibold text-ds-state-success">{service.successCount}</span>
          <span className="text-ds-text-primary/30">/</span>
          <span className="font-semibold text-ds-state-danger">{service.failCount}</span>
        </span>
      </div>
    </button>
  );
}

function RouteTabs(props: {
  groups: Array<{ id: RouteGroupId; title: string }>;
  active: RouteGroupId;
  onChange: (id: RouteGroupId) => void;
}) {
  return (
    <div className="inline-flex w-fit items-center rounded-md border border-ds-border bg-ds-surface-subtle p-0.5">
      {props.groups.map((group) => (
        <button
          key={group.id}
          type="button"
          onClick={() => props.onChange(group.id)}
          className={cx(
            'cursor-pointer rounded-[5px] border-0 px-3 py-1 text-[12px] font-medium transition-colors',
            group.id === props.active
              ? 'bg-[var(--ds-color-card-surface)] text-ds-text-primary shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
              : 'bg-transparent text-ds-text-primary/50 hover:text-ds-text-primary/70',
          )}
        >
          {group.title}
        </button>
      ))}
    </div>
  );
}

function RouteRankSection(props: { title: string; suffix: string; cards: RouteRankCard[]; valueColor: string; showTitle?: boolean }) {
  if (!props.cards.length) return null;
  return (
    <div className="flex flex-col gap-3">
      {props.showTitle !== false ? (
        <span className="text-[13px] font-semibold text-ds-text-primary/70">
          {props.title} · {props.suffix}
        </span>
      ) : null}
      <div className="grid grid-cols-2 gap-2.5 min-[760px]:grid-cols-5">
        {props.cards.slice(0, 5).map((card) => (
          <div
            key={`${card.country}-${card.provider}-${card.route}`}
            className="grid min-h-[120px] grid-rows-[auto_1fr_auto] gap-3 rounded-[8px] border border-[var(--ds-color-card-border)] bg-[var(--ds-color-card-surface)] p-3 shadow-[0_2px_2px_rgba(0,0,0,0.06)] backdrop-blur-ds"
          >
            <div className="flex min-w-0 items-start justify-between gap-2">
              <span className="inline-flex min-w-0 flex-1 items-center gap-1.5 text-[11px] font-medium text-ds-text-primary">
                <ResourceBadge
                  kind="provider"
                  value={card.provider}
                  size="sm"
                  iconUrl={card.providerIconUrl}
                  fallbackLabel={card.providerBadgeLabel ?? undefined}
                />
                <span className="min-w-0 truncate">{card.providerLabel}</span>
              </span>
              <span className="max-w-[46%] shrink-0 truncate text-right text-[10px] font-medium text-ds-text-primary/50">
                {card.routeLabel}
              </span>
            </div>
            <div className="flex min-w-0 items-center justify-center">
              <span className={`text-[22px] font-bold leading-none ${props.valueColor}`}>{card.value}</span>
            </div>
            <div className="flex min-w-0 items-end justify-between gap-3">
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <ResourceBadge
                  kind="country"
                  value={card.country}
                  iconUrl={card.countryIconUrl}
                  chrome="plain"
                  className="h-4 w-6 rounded-[3px] p-0 shadow-none"
                />
                <span className="min-w-0 truncate text-[11px] font-semibold text-ds-text-primary">
                  {card.countryLabel}
                </span>
              </span>
              <span className="text-[10px] font-semibold text-ds-text-primary/30">#{card.rank}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ServicePickerModal(props: {
  open: boolean;
  services: ServiceStats[];
  search: string;
  selectedService: string;
  onSearch: (value: string) => void;
  onClose: () => void;
  onSelect: (service: ServiceStats) => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal
      open={props.open}
      variant="selector"
      title={t('Choose Service')}
      subtitle={t('Switch the route ranking service.')}
      onClose={props.onClose}
      actions={<AppButton variant="ghost" size="utility" onClick={props.onClose}>{t('Close')}</AppButton>}
    >
      <SearchField
        compact
        value={props.search}
        onChange={(event) => props.onSearch(event.target.value)}
        placeholder={t('Search services...')}
        autoFocus
      />
      <div className="flex max-h-[360px] flex-col overflow-y-auto pb-2 pt-1">
        {props.services.length === 0 ? (
          <div className="px-5 py-8 text-center text-[12px] text-ds-text-secondary">{t('No services matched')}</div>
        ) : props.services.map((service) => (
          <button
            key={service.service}
            type="button"
            onClick={() => props.onSelect(service)}
            className={cx(
              'flex items-center justify-between gap-3 px-5 py-[9px] text-left transition-colors duration-fast ease-[var(--ds-motion-transition-fast)] hover:bg-[var(--ds-color-hover-subtle)]',
              service.service === props.selectedService && 'bg-ds-accent-soft',
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              <ResourceBadge kind="service" value={service.service} iconUrl={service.serviceIconUrl} />
              <span className="min-w-0 truncate text-[13px] font-semibold text-ds-text-primary">{service.serviceLabel}</span>
            </span>
            <span className="shrink-0 text-[11px] text-ds-text-secondary">{t('attempts_count', { count: service.totalAttempts })}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

function OverviewStatisticsSkeleton(props: {
  lookback: LookbackPeriod;
  layout: 'app' | 'web';
  onLookbackChange: (period: LookbackPeriod) => void;
}) {
  const routeGroupCount = props.layout === 'web' ? 3 : 1;
  return (
    <div className="flex flex-col gap-7" aria-busy="true">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 min-[760px]:flex-row min-[760px]:items-center min-[760px]:justify-between">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <div className="h-4 w-20 rounded-[5px] bg-ds-surface-subtle" />
            <div className="h-3 w-28 rounded-[5px] bg-ds-surface-subtle" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <LookbackSegment value={props.lookback} onChange={props.onLookbackChange} />
            <div className="h-7 w-24 rounded-[8px] bg-ds-surface-subtle" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2.5 min-[760px]:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="min-h-[88px] rounded-[8px] border border-[var(--ds-color-card-border)] bg-[var(--ds-color-card-surface)] p-3 shadow-[0_2px_2px_rgba(0,0,0,0.06)] backdrop-blur-ds">
              <div className="mb-5 flex items-center gap-2">
                <div className="h-7 w-7 rounded-[8px] bg-ds-surface-subtle" />
                <div className="h-3 w-20 rounded-[5px] bg-ds-surface-subtle" />
              </div>
              <div className="flex items-center justify-between">
                <div className="h-3 w-16 rounded-[5px] bg-ds-surface-subtle" />
                <div className="h-3 w-10 rounded-[5px] bg-ds-surface-subtle" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {props.layout === 'app' ? (
        <div className="flex flex-col gap-3">
          <div className="h-8 w-[260px] rounded-md bg-ds-surface-subtle" />
          <RouteSkeletonGrid />
        </div>
      ) : (
        Array.from({ length: routeGroupCount }).map((_, index) => (
          <div key={index} className="flex flex-col gap-3">
            <div className="h-4 w-36 rounded-[5px] bg-ds-surface-subtle" />
            <RouteSkeletonGrid />
          </div>
        ))
      )}
    </div>
  );
}

function RouteSkeletonGrid() {
  return (
    <div className="grid grid-cols-2 gap-2.5 min-[760px]:grid-cols-5">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="min-h-[120px] rounded-[8px] border border-[var(--ds-color-card-border)] bg-[var(--ds-color-card-surface)] p-3 shadow-[0_2px_2px_rgba(0,0,0,0.06)] backdrop-blur-ds">
          <div className="flex justify-between">
            <div className="h-3 w-16 rounded-[5px] bg-ds-surface-subtle" />
            <div className="h-3 w-14 rounded-[5px] bg-ds-surface-subtle" />
          </div>
          <div className="mx-auto mt-7 h-6 w-16 rounded-[5px] bg-ds-surface-subtle" />
          <div className="mt-7 flex justify-between">
            <div className="h-3 w-20 rounded-[5px] bg-ds-surface-subtle" />
            <div className="h-3 w-6 rounded-[5px] bg-ds-surface-subtle" />
          </div>
        </div>
      ))}
    </div>
  );
}
