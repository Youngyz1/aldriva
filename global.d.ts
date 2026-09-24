import { routing } from './i18n/routing';
import en from './messages/en.json';

type Messages = typeof en;

declare global {
  interface IntlMessages extends Messages {}
}

declare module 'next-intl' {
  interface AppConfig {
    Locale: typeof routing.locales[number];
    Messages: Messages;
  }
}
