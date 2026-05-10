import { i18n } from './i18n';
import type { LanguageCode } from './types';

export function formatProviderErrorMessage(
  error: unknown,
  language: LanguageCode,
) {
  const translate = i18n.getFixedT(language);
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes('EARLY_CANCEL_DENIED')) return translate('provider_error_early_cancel_denied');
  if (message.includes('NO_FREE_PHONES')) return translate('provider_error_no_free_phones');
  if (message.includes('ORDER_NOT_FOUND')) return translate('provider_error_order_not_found');
  if (message.includes('INSUFFICIENT_BALANCE')) return translate('provider_error_insufficient_balance');
  if (message.includes('INSUFFICIENT_RATING')) return translate('provider_error_insufficient_rating');
  if (message.includes('BAD_COUNTRY')) return translate('provider_error_bad_country');
  if (message.includes('BAD_OPERATOR')) return translate('provider_error_bad_operator');
  if (message.includes('NO_PRODUCT')) return translate('provider_error_no_product');
  if (message.includes('SERVER_OFFLINE')) return translate('provider_error_server_offline');
  if (message.includes('429') || message.includes('rate limit')) return translate('provider_error_retry_later');

  return message;
}
