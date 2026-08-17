export {};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        ready?: () => void;
        expand?: () => void;
        enableClosingConfirmation?: () => void;
        disableVerticalSwipes?: () => void;
      };
    };
  }
}
