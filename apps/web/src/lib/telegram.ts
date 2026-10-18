export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramWebApp {
  initData: string;
  initDataUnsafe?: { user?: TelegramUser };
  colorScheme?: 'light' | 'dark';
  themeParams?: Record<string, string>;
  ready(): void;
  expand(): void;
  openLink(url: string, options?: { try_instant_view?: boolean }): void;
  showConfirm(message: string, callback: (confirmed: boolean) => void): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  enableClosingConfirmation?(): void;
  HapticFeedback?: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
    selectionChanged(): void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export function getTelegram(): TelegramWebApp | null {
  if (typeof window === 'undefined') return null;
  return window.Telegram?.WebApp ?? null;
}

export function initTelegram(): boolean {
  const app = getTelegram();
  if (!app) return false;

  try {
    app.ready();
    app.expand();
    app.setHeaderColor?.('secondary_bg_color');
    app.setBackgroundColor?.('secondary_bg_color');
    document.documentElement.dataset.telegram = 'true';
    document.documentElement.style.colorScheme = app.colorScheme ?? 'light';
  } catch {
    // Older clients may not support every method; the UI works without them.
  }

  return true;
}

export function getInitData(): string {
  return getTelegram()?.initData ?? '';
}

export function getTelegramUser(): TelegramUser | null {
  return getTelegram()?.initDataUnsafe?.user ?? null;
}

export function isTelegram(): boolean {
  return getInitData().length > 0;
}

export function openExternal(url: string): void {
  const app = getTelegram();
  if (app && typeof app.openLink === 'function') {
    app.openLink(url);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function confirmAction(message: string): Promise<boolean> {
  const app = getTelegram();
  if (app && typeof app.showConfirm === 'function') {
    return new Promise((resolve) => app.showConfirm(message, resolve));
  }
  return Promise.resolve(window.confirm(message));
}

export function hapticTap(): void {
  try {
    getTelegram()?.HapticFeedback?.impactOccurred('light');
  } catch {
    // Haptics are optional.
  }
}
