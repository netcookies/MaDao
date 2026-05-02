import { AppButton, SearchField } from '../ui-bridge';
import type { OptionItem } from '../types';
import styles from './SearchSelectorModal.module.css';

export type SearchSelectorModalProps = {
  title: string;
  search: string;
  options: OptionItem[];
  onClose: () => void;
  onSearch: (value: string) => void;
  onSelect: (option: OptionItem) => void;
};

export function SearchSelectorModal(props: SearchSelectorModalProps) {
  return (
    <div className="d-backdrop" onClick={props.onClose}>
      <div className={`d-modal ${styles.selector}`} onClick={(event) => event.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>{props.title}</h2>
            <p className={styles.subtitle}>Search and pick a compatible option.</p>
          </div>
          <AppButton variant="ghost" size="utility" onClick={props.onClose}>Close</AppButton>
        </div>
        <div className={styles.searchWrap}>
          <SearchField
            compact
            value={props.search}
            onChange={(event) => props.onSearch(event.target.value)}
            placeholder="Search options..."
            autoFocus
          />
        </div>
        <div className={styles.list}>
          {props.options.map((option) => (
            <button key={`${option.value}-${option.label}`} className={styles.item} onClick={() => props.onSelect(option)}>
              <div className={styles.copy}>
                <strong className={styles.label}>{option.label}</strong>
                <span className={styles.hint}>{option.hint}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
