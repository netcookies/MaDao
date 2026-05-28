import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { i18n } from './app/i18n';
import { applyDocumentTheme, normalizeAppearanceTheme } from './app/theme';
import { getScreenshotLanguage, getScreenshotTarget, ScreenshotScene } from './testing/ScreenshotScene';
import './design-system/theme.css';
import './tailwind.css';
import './base.css';

const screenshotTarget = getScreenshotTarget();
const initialLanguage = screenshotTarget
  ? getScreenshotLanguage()
  : ((window.localStorage.getItem('madao-language') as 'en' | 'zh' | null) ?? 'en');
const initialTheme = screenshotTarget
  ? 'light'
  : normalizeAppearanceTheme(window.localStorage.getItem('madao-theme'));

void i18n.changeLanguage(initialLanguage);
document.documentElement.lang = initialLanguage;
applyDocumentTheme(initialTheme, initialLanguage);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {screenshotTarget ? <ScreenshotScene /> : <App />}
  </React.StrictMode>
);
