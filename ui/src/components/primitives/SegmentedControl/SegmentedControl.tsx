import { cx } from '../../../lib/cx';

export type SegmentedItem<T extends string> = {
  id: T;
  label: string;
};

export type SegmentedControlProps<T extends string> = {
  items: Array<SegmentedItem<T>>;
  value: T;
  onChange: (value: T) => void;
  appearance?: 'pill' | 'rail';
  className?: string;
};

const ROOT_CLASS = 'inline-flex items-stretch gap-ds-xs';
const ROOT_RAIL_CLASS = 'min-h-9 flex-nowrap items-center gap-1 rounded-sm bg-[#e5e5ea] p-1';
const ITEM_BASE_CLASS =
  'inline-flex min-h-control h-control min-w-[84px] items-center justify-center whitespace-nowrap rounded-pill border border-ds-border bg-ds-surface px-4 py-[11px] font-text text-utility-strong text-ds-text-primary transition-[background-color,color,border-color,box-shadow] duration-fast ease-[var(--ds-motion-transition-fast)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent-focus';
const ITEM_ACTIVE_CLASS = 'border-ds-accent-blue bg-ds-accent-blue text-white';
const ITEM_RAIL_CLASS =
  'min-h-7 h-7 min-w-0 rounded-[6px] border-transparent bg-transparent px-3 py-1.5 text-[13px] font-medium leading-[1.23] tracking-[0] shadow-none';
const ITEM_RAIL_ACTIVE_CLASS = 'border-transparent bg-ds-surface text-ds-text-primary shadow-[0_1px_2px_rgba(0,0,0,0.1)]';

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
              ITEM_BASE_CLASS,
              isRail && ITEM_RAIL_CLASS,
              active && ITEM_ACTIVE_CLASS,
              isRail && active && ITEM_RAIL_ACTIVE_CLASS,
            )}
            onClick={() => onChange(item.id)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
