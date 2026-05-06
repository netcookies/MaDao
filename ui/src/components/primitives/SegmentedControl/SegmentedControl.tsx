import type { ReactNode } from 'react';
import { cx } from '../../../lib/cx';

export type SegmentedItem<T extends string> = {
  id: T;
  label: string;
  icon?: ReactNode;
};

export type SegmentedControlProps<T extends string> = {
  items: Array<SegmentedItem<T>>;
  value: T;
  onChange: (value: T) => void;
  appearance?: 'pill' | 'rail';
  className?: string;
};

const ROOT_CLASS = 'inline-flex items-stretch gap-ds-xs';
const ROOT_RAIL_CLASS = 'inline-flex flex-nowrap items-center gap-1 rounded-[8px] border border-ds-border bg-ds-surface-subtle p-1';
const ITEM_PILL_CLASS =
  'inline-flex min-h-control h-control min-w-[84px] items-center justify-center whitespace-nowrap rounded-pill border border-ds-border bg-ds-surface px-4 py-[11px] font-text text-utility-strong text-ds-text-primary transition-[background-color,color,border-color,box-shadow] duration-fast ease-[var(--ds-motion-transition-fast)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent-focus';
const ITEM_PILL_ACTIVE_CLASS = 'border-ds-accent-blue bg-ds-accent-blue text-white';
const ITEM_RAIL_CLASS =
  'inline-flex h-7 min-w-0 items-center justify-center gap-[5px] whitespace-nowrap rounded-[6px] border border-transparent bg-transparent px-3 text-[13px] font-medium leading-none tracking-[0] text-ds-text-primary/60 transition-[background-color,color,box-shadow] duration-fast ease-[var(--ds-motion-transition-fast)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent-focus';
const ITEM_RAIL_ACTIVE_CLASS = 'border-ds-border bg-ds-surface text-ds-text-primary shadow-[0_1px_2px_rgba(0,0,0,0.10)]';

export function SegmentedControl<T extends string>(props: SegmentedControlProps<T>) {
  const { items, value, onChange, appearance = 'pill', className } = props;
  const isRail = appearance === 'rail';

  return (
    <div className={cx(ROOT_CLASS, isRail && ROOT_RAIL_CLASS, className)}>
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            className={cx(
              isRail ? ITEM_RAIL_CLASS : ITEM_PILL_CLASS,
              active && !isRail && ITEM_PILL_ACTIVE_CLASS,
              isRail && active && ITEM_RAIL_ACTIVE_CLASS,
            )}
            onClick={() => onChange(item.id)}
          >
            {item.icon ? <span className={cx(isRail ? 'opacity-60' : '')}>{item.icon}</span> : null}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
