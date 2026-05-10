import { useEffect } from 'react';
import type { LanguageCode } from './types';
import { i18n } from './i18n';
import { setWindowTitle } from '../services/windowApi';

const APP_TITLES: Record<LanguageCode, string> = {
  zh: '码到 —— 一站式接码助手',
  en: 'MaDao - One-Stop SMS Activation Assistant',
};

export function LanguageProvider(props: { language: LanguageCode; children: React.ReactNode }) {
  useEffect(() => {
    if (i18n.language !== props.language) {
      void i18n.changeLanguage(props.language);
    }
  }, [props.language]);

  useEffect(() => {
    const title = APP_TITLES[props.language];
    document.title = title;
    document.documentElement.lang = props.language === 'zh' ? 'zh-CN' : 'en';
    void setWindowTitle(title);
  }, [props.language]);

  return props.children;
}
