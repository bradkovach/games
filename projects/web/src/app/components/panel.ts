import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';

import { PreferencesService } from '../services/preferences';

/**
 * A side panel whose body can be collapsed under its heading. The
 * open/closed state is remembered per browser under `key`.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.collapsed]': 'collapsed()',
    class: 'panel',
  },
  selector: 'app-panel',
  styles: `
    :host {
      display: block;
    }
    h3 {
      margin: 0;
    }
    button {
      align-items: center;
      background: none;
      border: 0;
      border-radius: 0;
      color: inherit;
      cursor: pointer;
      display: flex;
      font: inherit;
      gap: 0.4rem;
      padding: 0.2rem 0;
      text-align: left;
      width: 100%;
    }
    button:hover {
      background: none;
      color: var(--accent);
    }
    .chevron {
      display: inline-block;
      font-size: 0.75em;
      transition: transform 0.15s;
    }
    :host(.collapsed) .chevron {
      transform: rotate(-90deg);
    }
    .body {
      margin-top: 0.4rem;
    }
    @media (prefers-reduced-motion: reduce) {
      .chevron {
        transition: none;
      }
    }
  `,
  template: `
    <h3>
      <button
        type="button"
        [attr.aria-expanded]="!collapsed()"
        [attr.aria-controls]="bodyId()"
        (click)="prefs.toggleCollapsed(key())"
      >
        <span class="chevron" aria-hidden="true">▼</span>
        {{ heading() }}
      </button>
    </h3>
    @if (!collapsed()) {
      <div class="body" [id]="bodyId()">
        <ng-content />
      </div>
    }
  `,
})
export class PanelComponent {
  readonly heading = input.required<string>();
  readonly key = input.required<string>();
  protected readonly bodyId = computed(
    () => `panel-${this.key()}`,
  );
  protected readonly prefs = inject(PreferencesService);
  protected readonly collapsed = computed(() =>
    this.prefs.isCollapsed(this.key()),
  );
}
