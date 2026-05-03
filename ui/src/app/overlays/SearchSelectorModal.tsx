import { AppButton, SearchField } from '../ui-bridge';
import { Modal } from '../../components/overlays';
import type { OptionItem } from '../types';

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
    <Modal
      open
      variant="selector"
      title={props.title}
      subtitle="Search and pick a compatible option."
      onClose={props.onClose}
      actions={<AppButton variant="ghost" size="utility" onClick={props.onClose}>Close</AppButton>}
    >
      <div className="pt-0">
        <SearchField
          compact
          value={props.search}
          onChange={(event) => props.onSearch(event.target.value)}
          placeholder="Search options..."
          autoFocus
        />
      </div>
      <div className="flex max-h-[360px] flex-col overflow-y-auto pb-2 pt-1">
        {props.options.map((option) => (
          <button
            key={`${option.value}-${option.label}`}
            className="flex items-center justify-start gap-2 px-5 py-[9px] text-left transition-colors duration-fast ease-[var(--ds-motion-transition-fast)] hover:bg-black/5"
            onClick={() => props.onSelect(option)}
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <strong className="text-utility tracking-[var(--ds-type-utility-tracking)] text-ds-text-primary">{option.label}</strong>
              <span className="text-caption tracking-[var(--ds-type-caption-tracking)] text-ds-text-secondary">{option.hint}</span>
            </div>
          </button>
        ))}
      </div>
    </Modal>
  );
}
