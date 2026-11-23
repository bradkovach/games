import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { PreferencesService } from '../services/preferences';
import {
  type ThemePreference,
  ThemeService,
} from '../services/theme';

/** Per-browser display and turn preferences. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  selector: 'app-preferences-panel',
  styles: `
    :host {
      display: grid;
      font-size: 0.9rem;
      gap: 0.5rem;
    }
    label {
      align-items: center;
      display: flex;
      gap: 0.5rem;
    }
  `,
  template: `
    @if (player()) {
      <label
        ><input
          type="checkbox"
          name="autoEndTurn"
          [checked]="prefs.autoEndTurn()"
          (change)="prefs.autoEndTurn.set(!prefs.autoEndTurn())"
        />
        Automatically end my turn when I have no moves</label
      >
      <label
        ><input
          type="checkbox"
          name="hideBoard"
          [checked]="prefs.hideBoard()"
          (change)="prefs.hideBoard.set(!prefs.hideBoard())"
        />
        Hide the board (use a shared screen)</label
      >
    }
    <label
      ><input
        type="checkbox"
        name="hideNav"
        [checked]="prefs.hideNav()"
        (change)="prefs.hideNav.set(!prefs.hideNav())"
      />
      Hide the navigation bar</label
    >
    <label
      >Theme
      <select
        name="theme"
        [value]="theme.preference()"
        (change)="setTheme($event)"
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select></label
    >
    <a routerLink="/">Home</a>
  `,
})
export class PreferencesPanelComponent {
  /** Show options that only matter to a seated player. */
  readonly player = input(false);
  protected readonly prefs = inject(PreferencesService);
  protected readonly theme = inject(ThemeService);

  protected setTheme(event: Event): void {
    this.theme.preference.set(
      (event.target as HTMLSelectElement)
        .value as ThemePreference,
    );
  }
}
