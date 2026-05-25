import { AlertCircle, Copy, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppButton, PageHeader, SegmentedControl } from '../ui-bridge';
import type { LanguageCode, MessageFilter, ProviderManifest, TicketDecoration, TicketRecord } from '../types';
import {
  getAutoReleaseRemainingMs,
  formatDurationMmSs,
  formatProviderLabel,
  formatServiceLabel,
  getElapsedDurationMs,
  getCancelRemainingMs,
  getTicketPhase,
  normalizeTicketStatus,
} from '../../lib/formatters';
import { ResourceBadge } from '../../components/primitives';
import { formatProviderErrorMessage } from '../providerErrors';

export type MessagesScreenProps = {
  tickets: TicketRecord[];
  providers?: Record<string, ProviderManifest>;
  decorations?: Record<string, TicketDecoration>;
  filter: MessageFilter;
  setFilter: (value: MessageFilter) => void;
  filters: Array<{ id: MessageFilter; label: string }>;
  busyAction: string;
  onCopy: (value: string, label: string) => void;
  onRelease: (ticket: TicketRecord, action: 'finish' | 'cancel' | 'retry') => void;
  onBuyAnother: (ticket: TicketRecord) => void;
};

export function MessagesScreen(props: MessagesScreenProps) {
  const { t, i18n } = useTranslation();
  const language = (i18n.resolvedLanguage ?? i18n.language ?? 'en') as LanguageCode;
  const [now, setNow] = useState(() => Date.now());

  function formatTicketMessage(message: string | null | undefined, fallback: string) {
    if (!message) return fallback;
    return i18n.exists(message) ? t(message) : message;
  }

  function formatTicketError(message: string | null | undefined) {
    if (!message) return null;
    return formatProviderErrorMessage(message, language);
  }

  function getReusePath(ticket: TicketRecord) {
    if (ticket.acquire_path === 'same_activation_retry') return t('Retry reuse');
    if (ticket.acquire_path === 'exact_reuse') return t('Exact reuse');
    if (ticket.acquire_path === 'intent_reuse') return t('Intent reuse');
    return null;
  }

  const visibleTickets = [...props.tickets]
    .sort((left, right) => {
      const leftTime = new Date(left.created_at ?? 0).getTime();
      const rightTime = new Date(right.created_at ?? 0).getTime();
      return rightTime - leftTime;
    })
    .slice(0, 8);

  useEffect(() => {
      const needsLiveTimer = props.tickets.some((ticket) => {
      const cooldownSec = props.providers?.[ticket.provider]?.behavior?.cancel_cooldown_sec;
      const phase = getTicketPhase(ticket.status);
      return (phase === 'waiting' || phase === 'cancel-pending')
        && (
          getCancelRemainingMs(ticket.created_at, cooldownSec, now) > 0
          || getElapsedDurationMs(ticket.created_at, now) >= 0
          || getAutoReleaseRemainingMs(ticket.auto_release_at, now) > 0
        );
    });
    if (!needsLiveTimer) return undefined;

    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [now, props.providers, props.tickets]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('Activations')}
        align="center"
        actions={<SegmentedControl items={props.filters} value={props.filter} onChange={props.setFilter} appearance="rail" className="min-h-0" />}
      />

      <div className="flex flex-col gap-5">
        {visibleTickets.length > 0 ? visibleTickets.map((ticket) => {
          const phase = getTicketPhase(ticket.status);
          const isReceived = phase === 'received';
          const isWaiting = phase === 'waiting';
          const isCancelPendingPhase = phase === 'cancel-pending';
          const isActivePhase = isWaiting || isCancelPendingPhase;
          const usesRoutingPlan = Boolean(ticket.routing_plan_id);
          const providerManifest = props.providers?.[ticket.provider];
          const cancelCooldownSec = providerManifest?.behavior?.cancel_cooldown_sec;
          const autoReleaseRemainingMs = getAutoReleaseRemainingMs(ticket.auto_release_at, now);
          const isCancelPending = normalizeTicketStatus(ticket.status) === 'cancel_pending';
          const cancelRemainingMs = isWaiting
            ? getCancelRemainingMs(ticket.created_at, cancelCooldownSec, now)
            : 0;
          const elapsedDurationMs = getElapsedDurationMs(ticket.created_at, now);
          const cancelLocked = cancelRemainingMs > 0;
          const ticketError = formatTicketError(ticket.message);
          const reusePath = getReusePath(ticket);
          const providerIconUrl = providerManifest?.ui?.icon_url;
          const providerBadgeLabel = providerManifest?.ui?.badge_label;

          return (
            <div className="flex flex-col gap-5 rounded-[16px] border border-ds-border bg-ds-surface px-6 py-6 shadow-ds backdrop-blur-ds" key={ticket.id}>
              <div className="flex flex-col gap-4 min-[760px]:flex-row min-[760px]:items-center min-[760px]:justify-between">
                <div className="flex items-center gap-3">
                  <ResourceBadge
                    kind="service"
                    value={ticket.service}
                    className="h-8 w-8 rounded-[10px] p-[6px]"
                    iconUrl={props.decorations?.[ticket.id]?.service_icon_url}
                  />
                  <strong className="text-body-strong tracking-[var(--ds-type-body-strong-tracking)] text-ds-text-primary">
                    {formatServiceLabel(ticket.service, language)}
                  </strong>
                </div>
                <div className="flex flex-wrap items-center justify-start gap-3 min-[760px]:justify-end">
                  <span className="inline-flex items-center rounded-md bg-ds-surface-subtle px-2.5 py-1 text-[12px] font-medium tracking-[0.04em] text-ds-text-secondary">
                    {isActivePhase
                      ? t('Waiting {{duration}}', { duration: formatDurationMmSs(elapsedDurationMs) })
                      : t('Elapsed {{duration}}', { duration: formatDurationMmSs(elapsedDurationMs) })}
                  </span>
                  <div className="inline-flex items-center gap-2 rounded-md bg-ds-surface-subtle px-3 py-1.5">
                    <span className="inline-flex items-center gap-1.5 text-body-strong tracking-[var(--ds-type-body-strong-tracking)] text-ds-text-primary">
                      {reusePath && (
                        <span className="inline-flex items-center rounded-pill bg-ds-state-success/10 px-2 py-0.5 text-[11px] font-semibold text-ds-state-success">
                          {t('Free')}
                        </span>
                      )}
                      <ResourceBadge
                        kind="country"
                        value={ticket.country}
                        size="sm"
                        iconUrl={props.decorations?.[ticket.id]?.country_icon_url}
                      />
                      {ticket.phone_number}
                    </span>
                    <button className="inline-flex h-[24px] w-[24px] items-center justify-center rounded-pill bg-ds-surface shadow-[0_1px_2px_rgba(0,0,0,0.08)]" onClick={() => props.onCopy(ticket.phone_number, t('Phone number'))} aria-label={t('Copy phone number')}>
                      <Copy size={14} className="text-ds-accent-blue" />
                    </button>
                  </div>
                  {ticket.price && (
                    <span className="text-[15px] font-semibold tracking-[0] text-ds-text-primary opacity-60">
                      ${ticket.price.toFixed(2)}
                    </span>
                  )}
                  {!isReceived && !isActivePhase && (
                    <span className="text-[15px] font-semibold tracking-[0] text-ds-state-danger">{t('Refunded')}</span>
                  )}
                </div>
              </div>

              {isReceived && (
                <div className="flex w-full flex-col items-center justify-center gap-3 rounded-[12px] border-2 border-ds-state-success bg-ds-surface-subtle px-5 py-8">
                  <div className="flex items-center gap-4">
                    <span className="text-[48px] font-bold leading-none tracking-[6px] text-ds-text-primary">{ticket.code ?? '------'}</span>
                    <button className="inline-flex h-11 w-11 items-center justify-center rounded-pill border border-ds-border bg-ds-surface shadow-[0_1px_2px_rgba(0,0,0,0.08)]" onClick={() => props.onCopy(ticket.code ?? '', t('SMS code'))} disabled={!ticket.code}>
                      <Copy size={20} className="text-ds-accent-blue" />
                    </button>
                  </div>
                  <span className="text-[14px] font-medium tracking-[0] text-ds-state-success">{t('SMS received successfully')}</span>
                </div>
              )}
              {isActivePhase && (
                <div className="flex w-full flex-col items-center justify-center gap-3 rounded-[12px] border-2 border-dashed border-ds-state-warning bg-ds-state-warning/10 px-5 py-8">
                  <Loader2 size={32} className="animate-[d-spin_0.9s_linear_infinite] text-ds-state-warning" />
                  <span className="text-[15px] font-semibold tracking-[0] text-ds-state-warning">
                    {isCancelPendingPhase ? t('Auto canceling...') : t('Waiting for SMS...')}
                  </span>
                  <span className="text-center text-[13px] tracking-[0.08em] text-ds-text-secondary">
                    {formatTicketMessage(ticket.message, t('Check provider dashboard'))}
                  </span>
                  {isCancelPending && autoReleaseRemainingMs > 0 && (
                    <span className="rounded-[999px] bg-ds-surface px-3 py-1 text-[12px] font-medium text-ds-text-secondary">
                      {t('Auto cancel in {{duration}}', { duration: formatDurationMmSs(autoReleaseRemainingMs) })}
                    </span>
                  )}
                  {isCancelPending && autoReleaseRemainingMs <= 0 && (
                    <span className="rounded-[999px] bg-ds-surface px-3 py-1 text-[12px] font-medium text-ds-text-secondary">
                      {t('Auto cancel retrying...')}
                    </span>
                  )}
                  {cancelLocked && (
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-center text-[12px] font-medium tracking-[0.04em] text-ds-state-warning">
                        {t('Cancel unlocks in {{duration}}', { duration: formatDurationMmSs(cancelRemainingMs) })}
                      </span>
                      {!isCancelPending && (
                        <span className="rounded-[999px] bg-ds-surface px-3 py-1 text-[12px] font-medium text-ds-text-secondary">
                          {t('Cancel cooling down')}
                        </span>
                      )}
                    </div>
                  )}
                  {!isCancelPendingPhase && !cancelLocked && ticketError && ticketError !== ticket.message && (
                    <span className="inline-flex items-center gap-2 rounded-[999px] bg-ds-surface px-3 py-1 text-[12px] font-medium text-ds-text-secondary">
                      <AlertCircle size={14} className="text-ds-state-warning" />
                      {ticketError}
                    </span>
                  )}
                </div>
              )}
              {!isReceived && !isActivePhase && (
                <div className="flex w-full flex-col gap-2 rounded-[12px] bg-ds-surface-subtle px-6 py-4 opacity-80">
                  <strong className="text-[15px] font-semibold tracking-[0] text-ds-text-primary">
                    {ticket.message?.includes('auto cancel retry')
                      ? t('Activation still pending provider action')
                      : t('Activation canceled or expired')}
                  </strong>
                  <p className="m-0 text-[14px] text-ds-text-secondary">
                    {ticket.message?.includes('auto cancel retry')
                      ? formatTicketMessage(ticket.message, t('Provider cancel did not complete yet. Review the provider dashboard before retrying.'))
                      : formatTicketMessage(ticket.message, t('You were not charged for this request.'))}
                  </p>
                </div>
              )}

              <div className="flex flex-col gap-3 pt-1 min-[760px]:flex-row min-[760px]:items-center min-[760px]:justify-between">
                <div className="flex flex-col gap-1">
                  <span className="inline-flex items-center gap-2 text-[13px] leading-[1.43] text-ds-text-secondary">
                    <ResourceBadge kind="provider" value={ticket.provider} size="sm" iconUrl={providerIconUrl} fallbackLabel={providerBadgeLabel ?? undefined} />
                    <span>{t('Provider: {{provider}}', { provider: formatProviderLabel(ticket.provider, language) })}</span>
                  </span>
                  {reusePath && (
                    <span className="text-[12px] leading-[1.4] text-ds-text-secondary">
                      {t('Reuse path')}: {reusePath}
                    </span>
                  )}
                  {usesRoutingPlan && (
                    <span className="text-[12px] leading-[1.4] text-ds-text-secondary">
                      {t('Routing: {{route}}', { route: ticket.routing_plan_name ?? ticket.routing_plan_id ?? '' })}
                      {ticket.routing_item_index != null ? t(' · Item {{index}}', { index: ticket.routing_item_index + 1 }) : ''}
                    </span>
                  )}
                </div>
                <div className="inline-flex flex-wrap items-center justify-start gap-3 min-[760px]:justify-end">
                  {isReceived && (
                    <AppButton
                      variant="primary"
                      size="utility"
                      onClick={() => props.onRelease(ticket, 'finish')}
                      disabled={props.busyAction === `finish-${ticket.id}`}
                    >
                      {t('Finish Activation')}
                    </AppButton>
                  )}
                  {isActivePhase && (
                    <>
                      <AppButton
                        variant="danger-outline"
                        size="utility"
                        onClick={() => props.onRelease(ticket, 'cancel')}
                        disabled={props.busyAction === `cancel-${ticket.id}` || cancelLocked || isCancelPending}
                      >
                        {isCancelPending
                          ? t('Auto cancel scheduled')
                          : cancelLocked
                          ? t('Cancel in {{duration}}', { duration: formatDurationMmSs(cancelRemainingMs) })
                          : t('Cancel & Refund')}
                      </AppButton>
                      <AppButton variant="success" size="utility" onClick={() => props.onBuyAnother(ticket)}>
                        {t('Buy Another')}
                      </AppButton>
                    </>
                  )}
                  {!isReceived && !isActivePhase && (
                    <AppButton variant="outline" size="utility" onClick={() => props.onRelease(ticket, 'retry')} disabled={props.busyAction === `retry-${ticket.id}`}>
                      {usesRoutingPlan
                        ? t('Try Next Route')
                        : t('Try Again')}
                    </AppButton>
                  )}
                </div>
              </div>
            </div>
          );
        }) : (
          <div className="rounded-lg border border-ds-border bg-ds-surface px-5 py-7 text-center text-utility tracking-[var(--ds-type-utility-tracking)] text-ds-text-secondary shadow-ds backdrop-blur-ds">
            {t('No activations.')}
          </div>
        )}
      </div>
    </div>
  );
}
