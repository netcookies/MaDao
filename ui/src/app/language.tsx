import { useEffect } from 'react';
import type { LanguageCode } from './types';
import { i18n } from './i18n';

export function LanguageProvider(props: { language: LanguageCode; children: React.ReactNode }) {
  useEffect(() => {
    if (i18n.language !== props.language) {
      void i18n.changeLanguage(props.language);
    }
  }, [props.language]);

  return props.children;
}
