import { Bot, Copy, Loader2, Send, Shield, Smartphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AppButton, PageHeader, SegmentedControl } from '../ui-bridge';
import type { MessageFilter, TicketRecord } from '../types';
import {
  formatDurationMmSs,
  formatProviderLabel,
  formatServiceLabel,
  getHeroCancelRemainingMs,
  getTicketPhase,
} from '../../lib/formatters';

export type MessagesScreenProps = {
  tickets: TicketRecord[];
  filter: MessageFilter;
  setFilter: (value: MessageFilter) => void;
  filters: Array<{ id: MessageFilter; label: string }>;
  busyAction: string;
  onCopy: (value: string, label: string) => void;
  onRelease: (ticket: TicketRecord, action: 'finish' | 'cancel' | 'retry') => void;
  onBuyAnother: (ticket: TicketRecord) => void;
};

function serviceIcon(service: string) {
  const value = service.toLowerCase();
  if (value.includes('telegram')) return <Send size={24} />;
  if (value.includes('paypal') || value.includes('shield')) return <Shield size={24} className="opacity-60" />;
  return <Bot size={24} />;
}

export function MessagesScreen(props: MessagesScreenProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const needsHeroCancelCountdown = props.tickets.some((ticket) =>
      ticket.provider.toLowerCase() === 'herosms'
      && getTicketPhase(ticket.status) === 'waiting'
      && getHeroCancelRemainingMs(ticket.created_at, now) > 0);
    if (!needsHeroCancelCountdown) return undefined;

    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [now, props.tickets]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Activations"
        align="center"
        actions={<SegmentedControl items={props.filters} value={props.filter} onChange={props.setFilter} appearance="rail" className="min-h-0" />}
      />

      <div className="flex flex-col gap-5">
        {props.tickets.length > 0 ? props.tickets.slice(0, 8).map((ticket) => {
          const phase = getTicketPhase(ticket.status);
          const isReceived = phase === 'received';
          const isWaiting = phase === 'waiting';
          const isHeroSms = ticket.provider.toLowerCase() === 'herosms';
          const usesRoutingPlan = Boolean(ticket.routing_plan_id);
          const heroCancelRemainingMs = isWaiting && isHeroSms
            ? getHeroCancelRemainingMs(ticket.created_at, now)
            : 0;
          const heroCancelLocked = heroCancelRemainingMs > 0;

          return (
            <div className="flex flex-col gap-5 rounded-[16px] border border-ds-border bg-ds-surface px-6 py-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)]" key={ticket.id}>
              <div className="flex flex-col gap-4 min-[760px]:flex-row min-[760px]:items-center min-[760px]:justify-between">
                <div className="flex items-center gap-3">
                  {serviceIcon(ticket.service)}
                  <strong className="text-body-strong tracking-[var(--ds-type-body-strong-tracking)] text-ds-text-primary">
                    {formatServiceLabel(ticket.service)}
                  </strong>
                </div>
                <div className="flex flex-wrap items-center justify-start gap-3 min-[760px]:justify-end">
                  <div className="inline-flex items-center gap-2 rounded-md bg-ds-surface-subtle px-3 py-1.5">
                    <span className="inline-flex items-center gap-1.5 text-body-strong tracking-[var(--ds-type-body-strong-tracking)] text-ds-text-primary">
                      <Smartphone size={14} className="opacity-60" />
                      {ticket.phone_number}
                    </span>
                    <button className="inline-flex h-[24px] w-[24px] items-center justify-center rounded-pill bg-ds-surface shadow-[0_1px_2px_rgba(0,0,0,0.08)]" onClick={() => props.onCopy(ticket.phone_number, 'Phone number')} aria-label="Copy phone number">
                      <Copy size={14} className="text-ds-accent-blue" />
                    </button>
                  </div>
                  {ticket.price && (
                    <span className="text-[15px] font-semibold tracking-[0] text-ds-text-primary opacity-60">
                      ${ticket.price.toFixed(2)}
                    </span>
                  )}
                  {!isReceived && !isWaiting && (
                    <span className="text-[15px] font-semibold tracking-[0] text-ds-state-danger">Refunded</span>
                  )}
                </div>
              </div>

              {isReceived && (
                <div className="flex w-full flex-col items-center justify-center gap-3 rounded-[12px] border-2 border-ds-state-success bg-ds-surface-subtle px-5 py-8">
                  <div className="flex items-center gap-4">
                    <span className="text-[48px] font-bold leading-none tracking-[6px] text-ds-text-primary">{ticket.code ?? '------'}</span>
                    <button className="inline-flex h-11 w-11 items-center justify-center rounded-pill border border-ds-border bg-ds-surface shadow-[0_1px_2px_rgba(0,0,0,0.08)]" onClick={() => props.onCopy(ticket.code ?? '', 'SMS code')} disabled={!ticket.code}>
                      <Copy size={20} className="text-ds-accent-blue" />
                    </button>
                  </div>
                  <span className="text-[14px] font-medium tracking-[0] text-ds-state-success">SMS received successfully</span>
                </div>
              )}
              {isWaiting && (
                <div className="flex w-full flex-col items-center justify-center gap-3 rounded-[12px] border-2 border-dashed border-ds-state-warning bg-ds-state-warning/10 px-5 py-8">
                  <Loader2 size={32} className="animate-[d-spin_0.9s_linear_infinite] text-ds-state-warning" />
                  <span className="text-[15px] font-semibold tracking-[0] text-ds-state-warning">Waiting for SMS...</span>
                  <span className="text-center text-[13px] tracking-[0.08em] text-ds-text-secondary">
                    {ticket.message ?? 'Check provider dashboard'}
                  </span>
                  {heroCancelLocked && (
                    <span className="text-center text-[12px] font-medium tracking-[0.04em] text-ds-state-warning">
                      HeroSMS cancel unlocks in {formatDurationMmSs(heroCancelRemainingMs)}
                    </span>
                  )}
                </div>
              )}
              {!isReceived && !isWaiting && (
                <div className="flex w-full flex-col gap-2 rounded-[12px] bg-ds-surface-subtle px-6 py-4 opacity-80">
                  <strong className="text-[15px] font-semibold tracking-[0] text-ds-text-primary">Activation canceled or expired</strong>
                  <p className="m-0 text-[14px] text-ds-text-secondary">
                    {ticket.message ?? 'You were not charged for this request.'}
                  </p>
                </div>
              )}

              <div className="flex flex-col gap-3 pt-1 min-[760px]:flex-row min-[760px]:items-center min-[760px]:justify-between">
                <div className="flex flex-col gap-1">
                  <span className="text-[13px] leading-[1.43] text-ds-text-secondary">Provider: {formatProviderLabel(ticket.provider)}</span>
                  {usesRoutingPlan && (
                    <span className="text-[12px] leading-[1.4] text-ds-text-secondary">
                      Routing: {ticket.routing_plan_name ?? ticket.routing_plan_id}
                      {ticket.routing_item_index != null ? ` · Item ${ticket.routing_item_index + 1}` : ''}
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
                      Finish Activation
                    </AppButton>
                  )}
                  {isWaiting && (
                    <>
                      <AppButton
                        variant="danger-outline"
                        size="utility"
                        onClick={() => props.onRelease(ticket, 'cancel')}
                        disabled={props.busyAction === `cancel-${ticket.id}` || heroCancelLocked}
                      >
                        {heroCancelLocked
                          ? `Cancel in ${formatDurationMmSs(heroCancelRemainingMs)}`
                          : 'Cancel & Refund'}
                      </AppButton>
                      <AppButton variant="success" size="utility" onClick={() => props.onBuyAnother(ticket)}>
                        Buy Another
                      </AppButton>
                    </>
                  )}
                  {!isReceived && !isWaiting && (
                    <AppButton variant="outline" size="utility" onClick={() => props.onRelease(ticket, 'retry')} disabled={props.busyAction === `retry-${ticket.id}`}>
                      {usesRoutingPlan ? 'Try Next Route' : 'Try Again'}
                    </AppButton>
                  )}
                </div>
              </div>
            </div>
          );
        }) : (
          <div className="rounded-lg border border-ds-border bg-ds-surface px-5 py-7 text-center text-utility tracking-[var(--ds-type-utility-tracking)] text-ds-text-secondary">
            No activations.
          </div>
        )}
      </div>
    </div>
  );
}
