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
    .board {
      display: grid;
      gap: 3px;
      grid-template-columns: repeat(12, minmax(0, 1fr));
    }
    .cell {
      aspect-ratio: 1;
      background: #e2e8f0;
      border: 2px solid transparent;
      border-radius: 4px;
      color: #94a3b8;
      font-size: clamp(0.55rem, 1.4vw, 0.85rem);
      padding: 0;
    }
    .cell.placed {
      background: #64748b;
      color: white;
    }
    .cell.chain {
      background: var(--tile-color);
      color: white;
      font-weight: 700;
      text-shadow: 0 1px 1px rgb(0 0 0 / 40%);
    }
    .cell.chain-tower,
    .cell.chain-continental {
      color: var(--ink);
      text-shadow: none;
    }
    .cell.mine {
      border-color: var(--ink);
      border-style: dashed;
      color: var(--ink);
    }
    .cell.selectable {
      background: #bfdbfe;
      cursor: pointer;
    }
    .cell.last {
      outline: 3px solid #facc15;
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
  readonly lastTile = input<null | TileId>(null);
  readonly selectable = input<TileId[]>([]);
  readonly tileClick = output<TileId>();

  protected readonly cells = computed(() => {
    const board = this.board();
    const hand = new Set(this.hand());
    const selectable = new Set(this.selectable());
    const last = this.lastTile();
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
        cells.push({
          classes: classes.join(' '),
          color: value ? `var(--${value})` : null,
          label: `${tile}${value ? ` ${CHAIN_NAMES[value]}` : value === null ? ' placed' : ''}`,
          selectable: selectable.has(tile),
          tile,
        });
      }
    }
    return cells;
  });
}
