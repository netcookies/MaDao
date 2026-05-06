import { useState } from 'react';
import type {
  ActivationFormState,
  AppearanceTheme,
  LanguageCode,
  LogFilter,
  MessageFilter,
  ProviderSectionId,
  ScreenId,
  SelectorState,
} from '../app/types';

export function useConsoleUiState() {
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string>('Console ready.');
  const [busyAction, setBusyAction] = useState<string>('');
  const [activeScreen, setActiveScreen] = useState<ScreenId>('overview');
  const [providerView, setProviderView] = useState<'list' | 'workspace'>('list');
  const [activeProviderSection, setActiveProviderSection] = useState<ProviderSectionId>('config');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showAdvancedEditor, setShowAdvancedEditor] = useState(true);
  const [compactTables, setCompactTables] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [messageFilter, setMessageFilter] = useState<MessageFilter>('all');
  const [logsFilter, setLogsFilter] = useState<LogFilter>('all');
  const [logsSearch, setLogsSearch] = useState('');
  const [selectorState, setSelectorState] = useState<SelectorState | null>(null);
  const [selectorSearch, setSelectorSearch] = useState('');
  const [showManifestModal, setShowManifestModal] = useState(false);
  const [showActivationModal, setShowActivationModal] = useState(false);
  const [activationForm, setActivationForm] = useState<ActivationFormState>({
    service: '',
    country: '',
    provider: 'auto',
    routing_plan_id: '',
    operator: '',
    min_price: '',
    max_price: '',
  });
  const [activationBusy, setActivationBusy] = useState(false);
  const [activationError, setActivationError] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);
  const [notificationCursor, setNotificationCursor] = useState(0);
  const [appearanceTheme, setAppearanceTheme] = useState<AppearanceTheme>('light');
  const [language, setLanguage] = useState<LanguageCode>('en');

  return {
    selectedProvider,
    setSelectedProvider,
    statusMessage,
    setStatusMessage,
    busyAction,
    setBusyAction,
    activeScreen,
    setActiveScreen,
    providerView,
    setProviderView,
    activeProviderSection,
    setActiveProviderSection,
    autoRefresh,
    setAutoRefresh,
    showAdvancedEditor,
    setShowAdvancedEditor,
    compactTables,
    setCompactTables,
    sidebarCollapsed,
    setSidebarCollapsed,
    messageFilter,
    setMessageFilter,
    logsFilter,
    setLogsFilter,
    logsSearch,
    setLogsSearch,
    selectorState,
    setSelectorState,
    selectorSearch,
    setSelectorSearch,
    showManifestModal,
    setShowManifestModal,
    showActivationModal,
    setShowActivationModal,
    activationForm,
    setActivationForm,
    activationBusy,
    setActivationBusy,
    activationError,
    setActivationError,
    showNotifications,
    setShowNotifications,
    notificationCursor,
    setNotificationCursor,
    appearanceTheme,
    setAppearanceTheme,
    language,
    setLanguage,
  };
}
