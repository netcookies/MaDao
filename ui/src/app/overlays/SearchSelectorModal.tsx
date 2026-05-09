import { AppButton, SearchField } from '../ui-bridge';
import { useTranslation } from 'react-i18next';
import { Modal } from '../../components/overlays';
import type { OptionItem, ResourceKind } from '../types';
import { ResourceBadge } from '../../components/primitives';

export type SearchSelectorModalProps = {
  title: string;
  search: string;
  options: OptionItem[];
  resourceKind?: ResourceKind;
  onClose: () => void;
  onSearch: (value: string) => void;
  onSelect: (option: OptionItem) => void;
};

export function SearchSelectorModal(props: SearchSelectorModalProps) {
  const { t } = useTranslation();

  return (
    <Modal
      open
      variant="selector"
      title={props.title}
      subtitle={t('Search and pick a compatible option.')}
      onClose={props.onClose}
      actions={<AppButton variant="ghost" size="utility" onClick={props.onClose}>{t('Close')}</AppButton>}
    >
      <div className="pt-0">
        <SearchField
          compact
          value={props.search}
          onChange={(event) => props.onSearch(event.target.value)}
          placeholder={t('Search options...')}
          autoFocus
        />
      </div>
      <div className="flex max-h-[360px] flex-col overflow-y-auto pb-2 pt-1">
        {props.options.map((option) => (
          <button
            key={`${option.value}-${option.label}`}
            className="flex items-center justify-start gap-2 px-5 py-[9px] text-left transition-colors duration-fast ease-[var(--ds-motion-transition-fast)] hover:bg-[var(--ds-color-hover-subtle)]"
            onClick={() => props.onSelect(option)}
          >
            {props.resourceKind ? (
              <ResourceBadge
                kind={props.resourceKind}
                value={option.value}
                iconUrl={option.icon_url ?? option.provider_icon_url}
              />
            ) : null}
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
