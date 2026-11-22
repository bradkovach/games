import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  effect,
  inject,
  Injectable,
  PLATFORM_ID,
  signal,
} from '@angular/core';

export type ThemePreference = 'dark' | 'light' | 'system';

/** Shared with the inline script in index.html. */
export const THEME_STORAGE_KEY = 'acquire.theme';

const PREFERENCES: readonly ThemePreference[] = [
  'dark',
  'light',
  'system',
];

/**
 * Colour scheme preference. "system" follows the OS setting via
 * `prefers-color-scheme`; the others pin `data-theme` on <html>.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly browser = isPlatformBrowser(
    inject(PLATFORM_ID),
  );
  readonly preference = signal<ThemePreference>(
    this.browser ? readPreference() : 'system',
  );
  private readonly document = inject(DOCUMENT);

  constructor() {
    effect(() => {
      const preference = this.preference();
      const root = this.document.documentElement;
      if (preference === 'system') {
        root.removeAttribute('data-theme');
      } else {
        root.setAttribute('data-theme', preference);
      }
      if (!this.browser) return;
      try {
        if (preference === 'system') {
          localStorage.removeItem(THEME_STORAGE_KEY);
        } else {
          localStorage.setItem(THEME_STORAGE_KEY, preference);
        }
      } catch {
        // Storage can be unavailable (private mode); ignore.
      }
    });
  }
}

function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return PREFERENCES.find((p) => p === stored) ?? 'system';
  } catch {
    return 'system';
  }
}
