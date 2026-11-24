import type { TileId, TileStatus } from 'engine';

import {
  ChangeDetectionStrategy,
  Component,
  input,
} from '@angular/core';

import { TickerComponent } from '../ticker/ticker';
import { TILE_HINTS } from '../tile-hints';

/**
 * Compact always-visible strip under the board: who you are (or
 * whose turn it is), your cash and your tiles. Projected content
 * (e.g. links) is placed at the far end.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.turn]': 'turn()' },
  imports: [TickerComponent],
  selector: 'app-status-bar',
  styles: `
    :host {
      align-items: center;
      background: var(--surface);
      border-top: 1px solid var(--line);
      column-gap: 1rem;
      display: flex;
      flex-wrap: wrap;
      font-size: 0.95rem;
      padding: 0.4rem 0.75rem;
      row-gap: 0.25rem;
    }
    :host(.turn) {
      box-shadow: inset 0 3px 0 var(--accent);
    }
    .who {
      align-items: center;
      display: flex;
      gap: 0.35rem;
      min-width: 0;
    }
    .avatar {
      font-size: 1.3rem;
      line-height: 1;
    }
    .name {
      font-weight: 700;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .cue {
      color: var(--accent);

      font-weight: 600;
    }
    .cash {
      font-weight: 600;
    }
    .tiles {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .tiles li {
      border: 1px solid var(--line);
      border-radius: 4px;
      font-size: 0.85rem;
      font-weight: 700;
      min-width: 2.2rem;
      padding: 0.1rem 0.3rem;
      text-align: center;
    }
    .tiles li.unplayable {
      border-style: dashed;
      color: var(--muted);
    }
    .tiles li.dead {
      border-color: var(--danger);
      color: var(--danger);
      text-decoration: line-through;
    }
    .end {
      align-items: center;
      display: flex;
      gap: 0.75rem;
      margin-left: auto;
    }
  `,
  template: `
    <span class="who">
      @if (avatar(); as avatar) {
        <span class="avatar emoji" aria-hidden="true">{{
          avatar
        }}</span>
      }
      <span class="name">{{ name() }}</span>
      @if (cue(); as cue) {
        <span class="cue">{{ cue }}</span>
      }
    </span>
    @if (cash() !== null) {
      <span class="cash">
        <span class="visually-hidden">Cash</span>
        <app-ticker format="currency" [value]="cash() ?? 0" />
      </span>
    }
    @if (hand().length > 0) {
      <ul class="tiles" aria-label="Your tiles">
        @for (t of hand(); track t.tile) {
          <li
            [class]="t.status"
            [title]="hints[t.status]"
            [attr.aria-label]="t.tile + '. ' + hints[t.status]"
          >
            {{ t.tile }}
          </li>
        }
      </ul>
    }
  `,
})
export class StatusBarComponent {
  readonly avatar = input<null | string | undefined>(null);
  readonly bagCount = input.required<number>();
  readonly cash = input<null | number>(null);
  /** Short note beside the name, e.g. "Your turn". */
  readonly cue = input<null | string>(null);
  readonly hand = input<
    readonly { status: TileStatus; tile: TileId }[]
  >([]);
  readonly name = input.required<string>();
  readonly turn = input(false);
  protected readonly hints = TILE_HINTS;
}
