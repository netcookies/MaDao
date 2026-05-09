import { AppButton, SearchField } from '../ui-bridge';
import { useTranslation } from 'react-i18next';
import { Modal } from '../../components/overlays';
import type { LanguageCode, ResourceKind, SelectorOptionViewModel } from '../types';
import { ResourceBadge } from '../../components/primitives';
import { presentSelectorOptionViewModel } from '../optionPresentation';

export type SearchSelectorModalProps = {
  title: string;
  search: string;
  options: SelectorOptionViewModel[];
  language: LanguageCode;
  resourceKind?: ResourceKind;
  onClose: () => void;
  onSearch: (value: string) => void;
  onSelect: (option: SelectorOptionViewModel) => void;
};

export function SearchSelectorModal(props: SearchSelectorModalProps) {
  const { t } = useTranslation();
  function optionPresentation(option: SelectorOptionViewModel) {
    return presentSelectorOptionViewModel(option);
  }

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
            key={option.id}
            className="flex items-center justify-start gap-2 px-5 py-[9px] text-left transition-colors duration-fast ease-[var(--ds-motion-transition-fast)] hover:bg-[var(--ds-color-hover-subtle)]"
            onClick={() => props.onSelect(option)}
          >
            {(() => {
              const presentation = optionPresentation(option);
              return props.resourceKind ? (
                <ResourceBadge
                  kind={props.resourceKind}
                  value={option.canonicalValue}
                  iconUrl={presentation.iconUrl}
                />
              ) : null;
            })()}
            <div className="flex min-w-0 flex-col gap-0.5">
              {(() => {
                const presentation = optionPresentation(option);
                return (
                  <>
                    <strong className="text-utility tracking-[var(--ds-type-utility-tracking)] text-ds-text-primary">{presentation.primary}</strong>
                    {presentation.secondary ? (
                      <span className="text-caption tracking-[var(--ds-type-caption-tracking)] text-ds-text-secondary">{presentation.secondary}</span>
                    ) : null}
                  </>
                );
              })()}
            </div>
          </button>
        ))}
      </div>
    </Modal>
  );
}
