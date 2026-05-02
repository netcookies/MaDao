import { Bot, Copy, Loader2, Send, Shield, Smartphone } from 'lucide-react';
import { AppButton, PageHeader, SegmentedControl } from '../ui-bridge';
import type { MessageFilter, TicketRecord } from '../types';
import { formatProviderLabel, formatServiceLabel, getTicketPhase } from '../../lib/formatters';
import styles from './MessagesScreen.module.css';

export type MessagesScreenProps = {
  tickets: TicketRecord[];
  filter: MessageFilter;
  setFilter: (value: MessageFilter) => void;
  filters: Array<{ id: MessageFilter; label: string }>;
  busyAction: string;
  onCopy: (value: string, label: string) => void;
  onRelease: (ticketId: string, action: 'finish' | 'cancel' | 'retry') => void;
  onBuyAnother: (ticket: TicketRecord) => void;
};

function serviceIcon(service: string) {
  const value = service.toLowerCase();
  if (value.includes('telegram')) return <Send size={24} />;
  if (value.includes('paypal') || value.includes('shield')) return <Shield size={24} className={styles.iconSoft} />;
  return <Bot size={24} />;
}

export function MessagesScreen(props: MessagesScreenProps) {
  return (
    <div className="d-page">
      <PageHeader
        title="Activations"
        align="center"
        actions={<SegmentedControl items={props.filters} value={props.filter} onChange={props.setFilter} appearance="rail" />}
      />

      <div className={styles.cardsList}>
        {props.tickets.length > 0 ? props.tickets.slice(0, 8).map((ticket) => {
          const phase = getTicketPhase(ticket.status);
          const isReceived = phase === 'received';
          const isWaiting = phase === 'waiting';

          return (
            <div className={styles.card} key={ticket.id}>
              <div className={styles.cardHead}>
                <div className={styles.service}>
                  {serviceIcon(ticket.service)}
                  <strong className={styles.serviceTitle}>{formatServiceLabel(ticket.service)}</strong>
                </div>
                <div className={styles.phoneWrap}>
                  <div className={styles.phonePill}>
                    <span className={styles.phoneText}>
                      <Smartphone size={14} className={styles.iconSoft} />{ticket.phone_number}
                    </span>
                    <button className={styles.inlineIcon} onClick={() => props.onCopy(ticket.phone_number, 'Phone number')} aria-label="Copy phone number">
                      <Copy size={14} color="#0066cc" />
                    </button>
                  </div>
                  {ticket.price && (
                    <span className={styles.price}>
                      ${ticket.price.toFixed(2)}
                    </span>
                  )}
                  {!isReceived && !isWaiting && (
                    <span className={styles.refunded}>Refunded</span>
                  )}
                </div>
              </div>

              {isReceived && (
                <div className={`${styles.codeArea} ${styles.received}`}>
                  <div className={styles.codeRow}>
                    <span className={styles.codeNum}>{ticket.code ?? '------'}</span>
                    <button className={styles.copyButton} onClick={() => props.onCopy(ticket.code ?? '', 'SMS code')} disabled={!ticket.code}>
                      <Copy size={20} color="#0066cc" />
                    </button>
                  </div>
                  <span className={`${styles.codeStateCopy} ${styles.codeStateSuccess}`}>SMS received successfully</span>
                </div>
              )}
              {isWaiting && (
                <div className={`${styles.codeArea} ${styles.waiting}`}>
                  <Loader2 size={32} color="#ffbd2e" className={styles.loader} />
                  <span className={`${styles.codeStateCopy} ${styles.codeStateWarning}`}>Waiting for SMS...</span>
                  <span className={styles.codeStateMeta}>
                    {ticket.message ?? 'Check provider dashboard'}
                  </span>
                </div>
              )}
              {!isReceived && !isWaiting && (
                <div className={`${styles.codeArea} ${styles.failed}`}>
                  <strong className={styles.codeStateTitle}>Activation canceled or expired</strong>
                  <p className={styles.codeStateMeta}>
                    {ticket.message ?? 'You were not charged for this request.'}
                  </p>
                </div>
              )}

              <div className={styles.footer}>
                <span className={styles.footerCopy}>Provider: {formatProviderLabel(ticket.provider)}</span>
                <div className={styles.footerActions}>
                  {isReceived && (
                    <AppButton
                      variant="primary"
                      size="utility"
                      onClick={() => props.onRelease(ticket.id, 'finish')}
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
                        onClick={() => props.onRelease(ticket.id, 'cancel')}
                        disabled={props.busyAction === `cancel-${ticket.id}`}
                      >
                        Cancel & Refund
                      </AppButton>
                      <AppButton variant="success" size="utility" onClick={() => props.onBuyAnother(ticket)}>
                        Buy Another
                      </AppButton>
                    </>
                  )}
                  {!isReceived && !isWaiting && (
                    <AppButton variant="outline" size="utility" onClick={() => props.onRelease(ticket.id, 'retry')} disabled={props.busyAction === `retry-${ticket.id}`}>
                      Try Again
                    </AppButton>
                  )}
                </div>
              </div>
            </div>
          );
        }) : (
          <div className="d-empty">No activations.</div>
        )}
      </div>
    </div>
  );
}
