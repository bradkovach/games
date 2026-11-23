import { isPlatformBrowser } from '@angular/common';
import {
  effect,
  inject,
  Injectable,
  PLATFORM_ID,
  signal,
  type WritableSignal,
} from '@angular/core';

const KEYS = {
  autoEndTurn: 'acquire.autoEndTurn',
  collapsed: 'acquire.collapsed',
  hideBoard: 'acquire.hideBoard',
  hideNav: 'acquire.hideNav',
} as const;

/** Per-browser preferences; never sent to the server. */
@Injectable({ providedIn: 'root' })
export class PreferencesService {
  /** End the turn automatically when there is nothing to do. */
  readonly autoEndTurn = this.flag(KEYS.autoEndTurn, true);
  /** Panels the player has collapsed, by panel key. */
  readonly collapsed = signal<Record<string, boolean>>(
    this.readCollapsed(),
  );
  /** Leave the board to a shared screen; show panels only. */
  readonly hideBoard = this.flag(KEYS.hideBoard, false);
  /** Hide the site navigation bar on game screens. */
  readonly hideNav = this.flag(KEYS.hideNav, false);
  // Field initializers run in sorted (not dependency) order, so each
  // one checks the platform itself.
  private readonly browser = inBrowser();

  constructor() {
    effect(() => {
      const value = JSON.stringify(this.collapsed());
      if (this.browser) write(KEYS.collapsed, value);
    });
  }

  isCollapsed(key: string): boolean {
    return this.collapsed()[key] === true;
  }

  toggleCollapsed(key: string): void {
    this.collapsed.update((c) => ({ ...c, [key]: !c[key] }));
  }

  private flag(
    key: string,
    fallback: boolean,
  ): WritableSignal<boolean> {
    const browser = inBrowser();
    const stored = browser ? read(key) : null;
    const value = signal(
      stored === null ? fallback : stored === 'true',
    );
    effect(() => {
      const next = value();
      if (browser) write(key, String(next));
    });
    return value;
  }

  private readCollapsed(): Record<string, boolean> {
    if (!inBrowser()) return {};
    try {
      const parsed: unknown = JSON.parse(
        read(KEYS.collapsed) ?? '{}',
      );
      return parsed && typeof parsed === 'object'
        ? (parsed as Record<string, boolean>)
        : {};
    } catch {
      return {};
    }
  }
}

function inBrowser(): boolean {
  return isPlatformBrowser(inject(PLATFORM_ID));
}

function read(key: string): null | string {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode); ignore.
  }
}
