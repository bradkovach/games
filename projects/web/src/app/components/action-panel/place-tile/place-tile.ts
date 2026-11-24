import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { type PlayerView } from 'engine';

import { GameClient } from '../../../services/game-client';
import { PreferencesService } from '../../../services/preferences';
import { TILE_HINTS } from '../../tile-hints';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-place-tile',
  styles: `
    .hand {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      margin: 0.5rem 0;
    }
    .tile {
      font-variant-numeric: tabular-nums;
      font-weight: 700;
      min-width: 3rem;
      padding: 0.45rem 0.5rem;
    }
    .tile.unplayable {
      border-style: dashed;
    }
    .tile.dead {
      text-decoration: line-through;
    }
  `,
  template: `
    <h3>Your turn: place a tile</h3>
    <p class="muted">
      {{
        prefs.hideBoard()
          ? 'Choose a tile to place.'
          : 'Choose a tile, or click a highlighted tile on the board.'
      }}
    </p>
    <div class="hand" role="group" aria-label="Your tiles">
      @for (t of view().me.hand; track t.tile) {
        <button
          type="button"
          class="tile {{ t.status }}"
          [disabled]="t.status !== 'playable'"
          [title]="hints[t.status]"
          [attr.aria-label]="
            t.status === 'playable'
              ? 'Place ' + t.tile
              : t.tile + '. ' + hints[t.status]
          "
          (click)="
            client.send({ tile: t.tile, type: 'placeTile' })
          "
        >
          {{ t.tile }}
        </button>
      }
    </div>
    <div class="row">
      @if (!hasPlayable()) {
        <button
          type="button"
          (click)="client.send({ type: 'passPlacement' })"
        >
          No playable tile — skip
        </button>
      }
      @if (canDeclare()) {
        <button
          type="button"
          class="secondary"
          (click)="declare()"
        >
          Declare game end
        </button>
      }
    </div>
  `,
})
export class PlaceTileComponent {
  readonly view = input.required<PlayerView>();
  protected readonly canDeclare = computed(
    () => this.view().canDeclareEnd && !this.view().endDeclared,
  );
  protected readonly client = inject(GameClient);
  protected readonly hasPlayable = computed(() =>
    this.view().me.hand.some((t) => t.status === 'playable'),
  );

  protected readonly hints = TILE_HINTS;
  protected readonly prefs = inject(PreferencesService);

  protected declare(): void {
    if (!confirm('Declare the end of the game?')) return;
    this.client.send({ type: 'declareEnd' });
  }
}
