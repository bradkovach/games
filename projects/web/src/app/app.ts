import { Component, inject } from '@angular/core';
import {
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';

import {
  type ThemePreference,
  ThemeService,
} from './services/theme';

@Component({
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly theme = inject(ThemeService);

  protected setTheme(event: Event): void {
    this.theme.preference.set(
      (event.target as HTMLSelectElement)
        .value as ThemePreference,
    );
  }
}
