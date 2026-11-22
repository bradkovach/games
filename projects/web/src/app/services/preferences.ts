import { isPlatformBrowser } from '@angular/common';
import {
  effect,
  inject,
  Injectable,
  PLATFORM_ID,
  signal,
} from '@angular/core';

const AUTO_END_KEY = 'acquire.autoEndTurn';

/** Per-browser preferences; never sent to the server. */
@Injectable({ providedIn: 'root' })
export class PreferencesService {
  private readonly browser = isPlatformBrowser(
    inject(PLATFORM_ID),
  );
  /** End the turn automatically when there is nothing to do. */
  readonly autoEndTurn = signal(
    this.browser && read(AUTO_END_KEY) === 'true',
  );

  constructor() {
    effect(() => {
      const value = this.autoEndTurn();
      if (this.browser) write(AUTO_END_KEY, String(value));
    });
  }
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
