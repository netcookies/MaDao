import { createContext, useContext } from 'react';
import type { LanguageCode } from './types';

const LanguageContext = createContext<LanguageCode>('en');

export function LanguageProvider(props: { language: LanguageCode; children: React.ReactNode }) {
  return (
    <LanguageContext.Provider value={props.language}>
      {props.children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
