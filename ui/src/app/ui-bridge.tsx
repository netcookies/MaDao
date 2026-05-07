import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import {
  Button,
  SearchField as DsSearchField,
  SegmentedControl as DsSegmentedControl,
  SelectTrigger as DsSelectTrigger,
  StatusPill as DsStatusPill,
  statusToneFromValue,
  ToggleSwitch as DsToggleSwitch,
} from '../components/primitives';
import {
  DataTable as DsDataTable,
  PageHeader as DsPageHeader,
  SectionHeader as DsSectionHeader,
} from '../components/composites';
import { cx } from '../lib/cx';

export type AppButtonVariant = 'primary' | 'outline' | 'success' | 'ghost' | 'danger-outline' | 'text';
export type AppButtonSize = 'default' | 'utility' | 'compact';

export function AppButton(props: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: AppButtonVariant;
  size?: AppButtonSize;
}) {
  const variantMap = {
    primary: 'primary',
    outline: 'outline',
    success: 'success',
    ghost: 'ghost',
    'danger-outline': 'dangerOutline',
    text: 'text',
  } as const;
  const {
    variant = 'primary',
    size = variant === 'primary' ? 'default' : 'utility',
    className,
    type = 'button',
    ...rest
  } = props;
  return (
    <Button
      type={type}
      variant={variantMap[variant]}
      size={size}
      className={className}
      {...rest}
    />
  );
}

export function PageHeader(props: {
  title: string;
  subtitle?: string;
  meta?: ReactNode;
  actions?: ReactNode;
  align?: 'start' | 'center';
}) {
  return (
    <DsPageHeader
      title={props.title}
      subtitle={props.subtitle}
      meta={props.meta}
      actions={props.actions}
      align={props.align}
    />
  );
}

export function SectionHeader(props: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <DsSectionHeader
      eyebrow={props.eyebrow}
      title={props.title}
      description={props.description}
      actions={props.actions}
      icon={props.icon}
      badge={props.badge}
    />
  );
}

export function SegmentedControl<T extends string>(props: {
  items: Array<{ id: T; label: string; icon?: ReactNode }>;
  value: T;
  onChange: (value: T) => void;
  appearance?: 'pill' | 'rail';
  className?: string;
}) {
  return (
    <DsSegmentedControl
      items={props.items}
      value={props.value}
      onChange={props.onChange}
      appearance={props.appearance}
      className={props.className}
    />
  );
}

export function SearchField(props: InputHTMLAttributes<HTMLInputElement> & {
  compact?: boolean;
  className?: string;
}) {
  const { compact = false, className, ...inputProps } = props;
  return (
    <DsSearchField compact={compact} className={className} {...inputProps} />
  );
}

export function SelectTrigger(props: {
  value: string;
  placeholder?: string;
  onClick: () => void;
  compact?: boolean;
  prominent?: boolean;
  muted?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <DsSelectTrigger
      value={props.value}
      placeholder={props.placeholder}
      onClick={props.onClick}
      compact={props.compact}
      prominent={props.prominent}
      muted={props.muted}
      disabled={props.disabled}
      className={props.className}
    />
  );
}

export function StatusBadge(props: { tone: 'green' | 'gray' | 'orange' | 'blue'; children: ReactNode }) {
  const toneClass = props.tone === 'green'
    ? 'bg-[var(--ds-color-state-success-soft)] text-ds-state-success'
    : props.tone === 'orange'
      ? 'bg-[var(--ds-color-state-warning-soft)] text-ds-state-warning'
      : props.tone === 'blue'
        ? 'bg-ds-accent-soft text-ds-accent-blue'
        : 'bg-ds-surface-subtle text-ds-text-secondary';

  return (
    <span
      className={cx(
        'inline-flex items-center rounded-pill px-2.5 py-1 font-text text-caption font-semibold tracking-[var(--ds-type-caption-tracking)]',
        toneClass,
      )}
    >
      {props.children}
    </span>
  );
}

export function StatusPill(props: { status: string }) {
  return (
    <DsStatusPill tone={statusToneFromValue(props.status)}>
      {props.status}
    </DsStatusPill>
  );
}

export function DataTable(props: {
  className?: string;
  headerClassName?: string;
  header: ReactNode;
  children: ReactNode;
}) {
  return (
    <DsDataTable
      className={cx('flex flex-col', props.className)}
      headerClassName={cx('flex flex-col', props.headerClassName)}
      bodyClassName="flex flex-col"
      header={props.header}
    >
      {props.children}
    </DsDataTable>
  );
}

export function ToggleSwitch(props: {
  checked: boolean;
  onChange: (value: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <DsToggleSwitch
      checked={props.checked}
      onChange={props.onChange}
      ariaLabel={props.ariaLabel}
    />
  );
}

export function SettingChoiceRow(props: {
  label: string;
  control: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <span className="font-text text-utility font-normal tracking-[var(--ds-type-utility-tracking)] text-ds-text-primary opacity-70">
        {props.label}
      </span>
      <div className="inline-flex min-h-9 items-center">{props.control}</div>
    </div>
  );
}

export function ToggleSetting(props: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  last?: boolean;
}) {
  return (
    <div
      className={cx(
        'flex items-center justify-between gap-4 py-4',
        !props.last && 'border-b border-ds-border',
      )}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <strong className="font-text text-utility font-normal tracking-[var(--ds-type-utility-tracking)] text-ds-text-primary">
          {props.title}
        </strong>
        <p className="m-0 font-text text-caption font-normal tracking-[var(--ds-type-caption-tracking)] text-ds-text-secondary">
          {props.description}
        </p>
      </div>
      <ToggleSwitch checked={props.checked} onChange={props.onChange} ariaLabel={props.title} />
    </div>
  );
}

export function ConfigRow(props: { label: string; children: ReactNode; last?: boolean }) {
  return (
    <div
      className={cx(
        'flex items-center justify-between gap-4 px-5 py-4',
        !props.last && 'border-b border-ds-border',
      )}
    >
      <span className="font-text text-utility font-normal tracking-[var(--ds-type-utility-tracking)] text-ds-text-primary opacity-70">
        {props.label}
      </span>
      <div className="min-w-0 flex-1">{props.children}</div>
    </div>
  );
}

export function DetailRow(props: { label: string; value: string; last?: boolean }) {
  return (
    <div
      className={cx(
        'flex items-center justify-between gap-4 px-5 py-4',
        !props.last && 'border-b border-ds-border',
      )}
    >
      <span className="font-text text-utility font-normal tracking-[var(--ds-type-utility-tracking)] text-ds-text-primary opacity-70">
        {props.label}
      </span>
      <span className="font-text text-[13px] font-medium leading-[1.43] tracking-[-0.224px] text-ds-text-primary">
        {props.value}
      </span>
    </div>
  );
}

export function ModalField(props: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="font-text text-[11px] font-semibold uppercase tracking-[0.08em] text-ds-text-primary opacity-50">
          {props.label}
        </span>
        {props.hint ? (
          <span className="font-text text-[11px] font-medium text-ds-accent-blue">
            {props.hint}
          </span>
        ) : null}
      </div>
      {props.children}
    </label>
  );
}
