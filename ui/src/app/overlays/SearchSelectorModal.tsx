import { AppButton, SearchField } from '../ui-bridge';
import { Modal } from '../../components/overlays';
import type { OptionItem } from '../types';
import { countryBadge, serviceBadge } from '../../lib/formatters';
import { useLanguage } from '../language';

export type SearchSelectorModalProps = {
  title: string;
  search: string;
  options: OptionItem[];
  onClose: () => void;
  onSearch: (value: string) => void;
  onSelect: (option: OptionItem) => void;
};

export function SearchSelectorModal(props: SearchSelectorModalProps) {
  const language = useLanguage();
  function optionBadge(option: OptionItem) {
    const hint = option.hint.toLowerCase();
    const value = option.value.toLowerCase();
    if (hint.includes('country') || hint.includes('auto select') || hint.includes('all countries')) {
      return countryBadge(option.value);
    }
    if (value === 'local' || value === 'usa' || value === 'uk' || value === 'germany' || value === 'japan' || value === 'canada' || value === 'australia' || value === 'russia' || value === 'argentina') {
      return countryBadge(option.value);
    }
    if (value === 'openai' || value === 'dr' || value === 'telegram' || value === 'tg' || value === 'whatsapp' || value === 'wa' || value === 'paypal' || value === 'discord') {
      return serviceBadge(option.value);
    }
    return null;
  }

  return (
    <Modal
      open
      variant="selector"
      title={props.title}
      subtitle={language === 'zh' ? '搜索并选择一个兼容选项。' : 'Search and pick a compatible option.'}
      onClose={props.onClose}
      actions={<AppButton variant="ghost" size="utility" onClick={props.onClose}>{language === 'zh' ? '关闭' : 'Close'}</AppButton>}
    >
      <div className="pt-0">
        <SearchField
          compact
          value={props.search}
          onChange={(event) => props.onSearch(event.target.value)}
          placeholder={language === 'zh' ? '搜索选项…' : 'Search options...'}
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
            {optionBadge(option) ? (
              <span className="shrink-0 text-[18px] leading-none">{optionBadge(option)}</span>
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
