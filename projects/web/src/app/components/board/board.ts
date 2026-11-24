import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import {
  CHAIN_NAMES,
  type ChainId,
  COLUMNS,
  ROWS,
  tileId,
  type TileId,
} from 'engine';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-board',
  styles: `
    :host {
      container-type: inline-size;
      display: block;
    }
    .board {
      display: grid;
      gap: 3px;
      grid-template-columns: repeat(12, minmax(0, 1fr));
    }
    .cell {
      aspect-ratio: 1;
      background: var(--cell-empty);
      border: 2px solid transparent;
      border-radius: 4px;
      color: var(--cell-empty-ink);
      font-size: clamp(0.65rem, 2.8cqi, 1rem);
      padding: 0;
    }
    .cell.placed {
      background: var(--cell-placed);
      color: var(--on-chain);
    }
    .cell.chain {
      background: var(--tile-color);
      color: var(--on-chain);
      font-weight: 700;
      text-shadow: 0 1px 1px rgb(0 0 0 / 40%);
    }
    .cell.chain-tower,
    .cell.chain-continental {
      color: var(--on-light-chain);
      text-shadow: none;
    }
    .cell.mine {
      border-color: var(--ink);
      border-style: dashed;
      color: var(--ink);
    }
    /* Pulses in neutral ink so it never resembles a chain colour. */
    .cell.selectable {
      animation: tile-pulse 1.6s ease-in-out infinite;
      cursor: pointer;
    }
    .cell.selectable:hover,
    .cell.selectable:focus-visible {
      animation: none;
      background: color-mix(
        in srgb,
        var(--ink) 30%,
        var(--cell-empty)
      );
    }
    @keyframes tile-pulse {
      0%,
      100% {
        background: var(--cell-empty);
        box-shadow: 0 0 0 0 transparent;
      }
      50% {
        background: color-mix(
          in srgb,
          var(--ink) 20%,
          var(--cell-empty)
        );
        box-shadow: 0 0 0 2px
          color-mix(in srgb, var(--ink) 40%, transparent);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .cell.selectable {
        animation: none;
        background: color-mix(
          in srgb,
          var(--ink) 20%,
          var(--cell-empty)
        );
        border-style: solid;
      }
    }
    .cell.last {
      outline: 3px solid var(--highlight);
    }
  `,
  template: `
    <div class="board" role="grid" aria-label="Game board">
      @for (cell of cells(); track cell.tile) {
        <button
          type="button"
          class="cell"
          [class]="cell.classes"
          [disabled]="!cell.selectable"
          [attr.aria-label]="cell.label"
          [style.--tile-color]="cell.color"
          [title]="cell.label"
          (click)="tileClick.emit(cell.tile)"
        >
          {{ cell.tile }}
        </button>
      }
    </div>
  `,
})
export class BoardComponent {
  readonly board =
    input.required<Partial<Record<TileId, ChainId | null>>>();
  readonly hand = input<TileId[]>([]);
  readonly hints = input<Partial<Record<TileId, string>>>({});
  readonly lastTile = input<null | TileId>(null);
  readonly selectable = input<TileId[]>([]);
  readonly tileClick = output<TileId>();

  protected readonly cells = computed(() => {
    const board = this.board();
    const hand = new Set(this.hand());
    const selectable = new Set(this.selectable());
    const last = this.lastTile();
    const hints = this.hints();
    const cells = [];
    for (let row = 0; row < ROWS.length; row++) {
      for (let col = 0; col < COLUMNS; col++) {
        const tile = tileId(col, row);
        const value = board[tile];
        const classes = ['cell'];
        if (value !== undefined) classes.push('placed');
        if (value) classes.push('chain', `chain-${value}`);
        if (hand.has(tile)) classes.push('mine');
        if (selectable.has(tile)) classes.push('selectable');
        if (tile === last) classes.push('last');
        const name = `${tile}${value ? ` ${CHAIN_NAMES[value]}` : value === null ? ' placed' : ''}`;
        const hint = hints[tile];
        if (hint) classes.push('hinted');
        cells.push({
          classes: classes.join(' '),
          color: value ? `var(--${value})` : null,
          label: hint ? `${name}. ${hint}` : name,
          selectable: selectable.has(tile),
          tile,
        });
      }
    }
    return cells;
  });
}
