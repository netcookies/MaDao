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
      className={cx('d-page-header', props.align === 'center' && 'is-center')}
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
  items: Array<{ id: T; label: string }>;
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

export function StatusBadge(props: { tone: 'green' | 'gray' | 'orange'; children: ReactNode }) {
  return <span className={`d-badge ${props.tone}`}>{props.children}</span>;
}

export function StatusPill(props: { status: string }) {
  return (
    <DsStatusPill
      tone={statusToneFromValue(props.status)}
      className={cx('d-status-pill', `is-ds-tone-${statusToneFromValue(props.status)}`)}
    >
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
      className={cx('d-data-table', props.className)}
      headerClassName={cx('d-data-table-head', props.headerClassName)}
      bodyClassName="d-data-table-body"
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
      className={cx('d-toggle', props.checked && 'on')}
    />
  );
}

export function SettingChoiceRow(props: {
  label: string;
  control: ReactNode;
}) {
  return (
    <div className="d-detail-row d-detail-row-choice">
      <span className="d-detail-label">{props.label}</span>
      <div className="d-setting-choice-control">{props.control}</div>
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
    <div className={`d-toggle-row${props.last ? '' : ' border'}`}>
      <div className="d-toggle-copy">
        <strong className="d-toggle-title">{props.title}</strong>
        <p className="d-toggle-description">{props.description}</p>
      </div>
      <ToggleSwitch checked={props.checked} onChange={props.onChange} ariaLabel={props.title} />
    </div>
  );
}

export function ConfigRow(props: { label: string; children: ReactNode; last?: boolean }) {
  return (
    <div className={`d-config-row${props.last ? ' last' : ''}`}>
      <span className="d-config-label">{props.label}</span>
      <div className="d-config-value">{props.children}</div>
    </div>
  );
}

export function DetailRow(props: { label: string; value: string; last?: boolean }) {
  return (
    <div className={`d-pd-row${props.last ? '' : ' border'}`}>
      <span className="d-detail-label">{props.label}</span>
      <span className="d-detail-value">{props.value}</span>
    </div>
  );
}

export function ModalField(props: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="d-modal-field">
      <div className="d-modal-field-label-wrap">
        <span className="d-modal-field-label">{props.label}</span>
        {props.hint && <span className="d-field-hint">{props.hint}</span>}
      </div>
      {props.children}
    </label>
  );
}
