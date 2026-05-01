import { cx } from '../../../lib/cx';
import styles from './SegmentedControl.module.css';

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

export function SegmentedControl<T extends string>(props: SegmentedControlProps<T>) {
  const { items, value, onChange, appearance = 'pill', className } = props;
  const isRail = appearance === 'rail';

  return (
    <div className={cx(styles.root, isRail && styles.rail, className)}>
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            className={cx(
              styles.item,
              isRail && styles.itemRail,
              active && styles.itemActive,
              isRail && active && styles.itemRailActive,
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
