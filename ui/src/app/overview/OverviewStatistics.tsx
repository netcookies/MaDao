import { SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AppButton } from '../ui-bridge';

export type LookbackPeriod = '24h' | '3d' | '7d';

export type ServiceStats = {
  service: string;
  icon?: string;
  color?: string;
  totalAttempts: number;
  successCount: number;
  failCount: number;
};

export type RouteRankCard = {
  country: string;
  countryFlag: string;
  provider: string;
  route: string;
  value: string;
  rank: number;
};

export type OverviewStatisticsProps = {
  services: ServiceStats[];
  bestRoutes: RouteRankCard[];
  cheapestRoutes: RouteRankCard[];
  fastestRoutes: RouteRankCard[];
  selectedService: string;
  onServiceSelect: (service: string) => void;
  lookback: LookbackPeriod;
  onLookbackChange: (period: LookbackPeriod) => void;
  onMoreFilters?: () => void;
};

const LOOKBACK_OPTIONS: LookbackPeriod[] = ['24h', '3d', '7d'];

export function OverviewStatistics(props: OverviewStatisticsProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-7">
      <h2 className="m-0 font-text text-[16px] font-semibold tracking-[0] text-ds-text-primary">
        {t('Statistics')}
      </h2>

      {/* Popular Services header + cards */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[13px] font-semibold text-ds-text-primary/70">{t('Popular Services')}</span>
          <div className="flex items-center gap-2">
            <LookbackSegment value={props.lookback} onChange={props.onLookbackChange} />
            {props.onMoreFilters && (
              <AppButton variant="outline" size="utility" onClick={props.onMoreFilters}>
                <SlidersHorizontal size={12} className="opacity-50" />
                <span className="ml-1.5">{t('More Filters')}</span>
              </AppButton>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2.5 min-[760px]:grid-cols-5">
          {props.services.map((svc) => (
            <ServiceCard
              key={svc.service}
              service={svc}
              selected={svc.service === props.selectedService}
              onClick={() => props.onServiceSelect(svc.service)}
            />
          ))}
        </div>
      </div>

      {/* Route ranking sections */}
      <RouteRankSection title={t('Best Routes')} suffix={props.selectedService} cards={props.bestRoutes} valueColor="text-ds-state-success" />
      <RouteRankSection title={t('Cheapest Routes')} suffix={props.selectedService} cards={props.cheapestRoutes} valueColor="text-[var(--ds-color-accent,#007aff)]" />
      <RouteRankSection title={t('Fastest Routes')} suffix={props.selectedService} cards={props.fastestRoutes} valueColor="text-[var(--ds-color-accent,#007aff)]" />
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
  const { service, selected, onClick } = props;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex cursor-pointer flex-col gap-2 rounded-[8px] border bg-[var(--ds-color-card-surface)] p-3 shadow-[0_2px_2px_rgba(0,0,0,0.06)] backdrop-blur-ds transition-colors ${
        selected ? 'border-[var(--ds-color-accent,#007aff)] border-[1.5px]' : 'border-[var(--ds-color-card-border)]'
      }`}
    >
      <div className="flex items-center gap-2">
        <div className="h-6 w-6 rounded-md" style={{ backgroundColor: service.color ?? '#8e8e93' }} />
        <span className="text-[12px] font-semibold text-ds-text-primary">{service.service}</span>
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

function RouteRankSection(props: { title: string; suffix: string; cards: RouteRankCard[]; valueColor: string }) {
  if (!props.cards.length) return null;
  return (
    <div className="flex flex-col gap-3">
      <span className="text-[13px] font-semibold text-ds-text-primary/70">
        {props.title} · {props.suffix}
      </span>
      <div className="grid grid-cols-2 gap-2.5 min-[760px]:grid-cols-5">
        {props.cards.slice(0, 5).map((card) => (
          <div
            key={`${card.country}-${card.provider}-${card.route}`}
            className="flex flex-col gap-1.5 rounded-[8px] border border-[var(--ds-color-card-border)] bg-[var(--ds-color-card-surface)] p-3 shadow-[0_2px_2px_rgba(0,0,0,0.06)] backdrop-blur-ds"
          >
            <div className="flex items-center gap-1.5">
              <span className="text-[14px]">{card.countryFlag}</span>
              <span className="text-[12px] font-semibold text-ds-text-primary">{card.country}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] font-medium text-ds-text-primary">{card.provider}</span>
              <span className="text-[10px] text-ds-text-primary/50">{card.route}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className={`text-[14px] font-bold ${props.valueColor}`}>{card.value}</span>
              <span className="text-[10px] font-semibold text-ds-text-primary/30">#{card.rank}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
