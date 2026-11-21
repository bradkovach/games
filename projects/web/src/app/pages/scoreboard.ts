import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  signal,
} from '@angular/core';
import {
  bonusTable,
  CHAIN_NAMES,
  type ChainId,
  CHAINS,
  type GameMode,
  rankPlayers,
} from 'engine';

import {
  emptyScoreboard,
  newPlayer,
  parseScoreboard,
  score,
  type ScoreboardState,
  STORAGE_KEY,
  warnings,
} from './scoreboard-model';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-scoreboard',
  styles: `
    table input {
      text-align: right;
      width: 4.5rem;
    }
    table input.name {
      text-align: left;
      width: 8rem;
    }
    td,
    th {
      padding: 0.2rem 0.3rem;
    }
    .winner {
      font-weight: 700;
    }
    .scroll {
      overflow-x: auto;
    }
  `,
  template: `
    <section class="panel">
      <div class="row">
        <h2 style="margin: 0">Scoreboard</h2>
        <label
          >Mode
          <select
            [value]="state().mode"
            (change)="setMode($any($event.target).value)"
          >
            <option value="classic">Classic</option>
            <option value="tycoon">Tycoon</option>
          </select>
        </label>
        <button
          type="button"
          class="secondary"
          (click)="addPlayer()"
          [disabled]="state().players.length >= 6"
        >
          Add player
        </button>
        <button
          type="button"
          class="secondary"
          (click)="reset()"
        >
          Reset
        </button>
      </div>
      <p class="muted">
        Enter each player's cash and shares, and the size of each
        chain on the board.
      </p>
      <div class="scroll">
        <table>
          <thead>
            <tr>
              <th>Player</th>
              <th>Cash</th>
              @for (c of chains; track c) {
                <th>
                  <span class="chip chain-{{ c }}">{{
                    names[c]
                  }}</span>
                </th>
              }
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th colspan="2" style="text-align: right">
                Chain size
              </th>
              @for (c of chains; track c) {
                <td>
                  <input
                    type="number"
                    min="0"
                    max="108"
                    [attr.aria-label]="names[c] + ' size'"
                    [value]="state().chainSizes[c] ?? ''"
                    (input)="setSize(c, $event)"
                  />
                </td>
              }
              <td></td>
            </tr>
            @for (
              p of state().players;
              track p.id;
              let i = $index
            ) {
              <tr>
                <td>
                  <input
                    class="name"
                    [value]="p.name"
                    aria-label="Name"
                    (input)="setName(i, $event)"
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    aria-label="Cash"
                    [value]="p.cash || ''"
                    (input)="setCash(i, $event)"
                  />
                </td>
                @for (c of chains; track c) {
                  <td>
                    <input
                      type="number"
                      min="0"
                      max="25"
                      [attr.aria-label]="p.name + ' ' + names[c]"
                      [value]="p.holdings[c] || ''"
                      (input)="setHolding(i, c, $event)"
                    />
                  </td>
                }
                <td>
                  <button
                    type="button"
                    class="secondary"
                    (click)="removePlayer(i)"
                    aria-label="Remove player"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      @for (w of problems(); track w) {
        <p class="error">{{ w }}</p>
      }
    </section>

    <div class="grid-2">
      <section class="panel">
        <h3>Results</h3>
        @if (results(); as r) {
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Player</th>
                <th>Cash</th>
                <th>Bonuses</th>
                <th>Stock sales</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              @for (row of standings(); track row.id) {
                <tr [class.winner]="row.place === 1">
                  <td>{{ row.place }}</td>
                  <td>{{ nameOf(row.id) }}</td>
                  <td>\${{ cashOf(row.id) }}</td>
                  <td>\${{ bonusOf(row.id) }}</td>
                  <td>\${{ r.sales[row.id] }}</td>
                  <td>\${{ row.cash }}</td>
                </tr>
              }
            </tbody>
          </table>
          <h4>Bonuses paid</h4>
          <ul>
            @for (c of chains; track c) {
              @if (r.bonuses[c]; as paid) {
                <li>
                  <span class="chip chain-{{ c }}">{{
                    names[c]
                  }}</span>
                  @for (entry of entries(paid); track entry[0]) {
                    {{ nameOf(entry[0]) }} \${{ entry[1]
                    }}{{ $last ? '' : ',' }}
                  } @empty {
                    <span class="muted">no stockholders</span>
                  }
                </li>
              }
            }
          </ul>
        } @else {
          <p class="muted">Add players to see results.</p>
        }
      </section>

      <section class="panel">
        <h3>Price lookup</h3>
        <label
          >Chain size
          <input
            type="number"
            min="2"
            max="108"
            [value]="lookupSize()"
            (input)="lookupSize.set(num($event) || 2)"
          />
        </label>
        <table>
          <thead>
            <tr>
              <th>Chain</th>
              <th>Price</th>
              <th>Primary</th>
              <th>Secondary</th>
              @if (state().mode === 'tycoon') {
                <th>Tertiary</th>
              }
            </tr>
          </thead>
          <tbody>
            @for (row of lookup(); track row.chain) {
              <tr>
                <td>
                  <span class="chip chain-{{ row.chain }}">{{
                    names[row.chain]
                  }}</span>
                </td>
                <td>\${{ row.price }}</td>
                <td>\${{ row.primary }}</td>
                <td>\${{ row.secondary }}</td>
                @if (state().mode === 'tycoon') {
                  <td>\${{ row.tertiary }}</td>
                }
              </tr>
            }
          </tbody>
        </table>
      </section>
    </div>
  `,
})
export class ScoreboardPage {
  protected readonly chains = CHAINS;
  protected readonly lookupSize = signal(2);
  protected readonly state = signal<ScoreboardState>(
    emptyScoreboard(),
  );
  protected readonly lookup = computed(() =>
    CHAINS.map((chain) => ({
      chain,
      ...bonusTable(chain, this.lookupSize(), this.state().mode),
    })),
  );
  protected readonly names = CHAIN_NAMES;
  protected readonly problems = computed(() =>
    warnings(this.state()),
  );
  protected readonly results = computed(() =>
    score(this.state()),
  );
  protected readonly standings = computed(() => {
    const results = this.results();
    return results ? rankPlayers(results.finalCash) : [];
  });

  private loaded = false;

  constructor() {
    // Storage is browser-only; this page is also prerendered.
    afterNextRender(() => {
      this.state.set(
        parseScoreboard(localStorage.getItem(STORAGE_KEY)),
      );
      this.loaded = true;
    });
    effect(() => {
      const state = this.state();
      if (this.loaded) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      }
    });
  }

  protected addPlayer(): void {
    this.state.update((s) => ({
      ...s,
      players: [...s.players, newPlayer(s.players.length + 1)],
    }));
  }

  protected bonusOf(id: string): number {
    const results = this.results();
    if (!results) return 0;
    return Object.values(results.bonuses).reduce(
      (sum, paid) => sum + (paid?.[id] ?? 0),
      0,
    );
  }

  protected cashOf(id: string): number {
    return (
      this.state().players.find((p) => p.id === id)?.cash ?? 0
    );
  }

  protected entries(
    paid: Record<string, number>,
  ): [string, number][] {
    return Object.entries(paid).filter(
      ([, amount]) => amount > 0,
    );
  }

  protected nameOf(id: string): string {
    return (
      this.state().players.find((p) => p.id === id)?.name ?? id
    );
  }

  protected num(event: Event): number {
    const value = Number(
      (event.target as HTMLInputElement).value,
    );
    return Number.isFinite(value)
      ? Math.max(0, Math.floor(value))
      : 0;
  }

  protected removePlayer(index: number): void {
    this.state.update((s) => ({
      ...s,
      players: s.players.filter((_, i) => i !== index),
    }));
  }

  protected reset(): void {
    if (confirm('Clear the scoreboard?')) {
      this.state.set(emptyScoreboard());
    }
  }

  protected setCash(index: number, event: Event): void {
    const cash = this.num(event);
    this.updatePlayer(index, (p) => ({ ...p, cash }));
  }

  protected setHolding(
    index: number,
    chain: ChainId,
    event: Event,
  ): void {
    const count = this.num(event);
    this.updatePlayer(index, (p) => ({
      ...p,
      holdings: { ...p.holdings, [chain]: count },
    }));
  }

  protected setMode(mode: GameMode): void {
    this.state.update((s) => ({ ...s, mode }));
  }

  protected setName(index: number, event: Event): void {
    const name = (event.target as HTMLInputElement).value;
    this.updatePlayer(index, (p) => ({ ...p, name }));
  }

  protected setSize(chain: ChainId, event: Event): void {
    const size = this.num(event);
    this.state.update((s) => ({
      ...s,
      chainSizes: { ...s.chainSizes, [chain]: size },
    }));
  }

  private updatePlayer(
    index: number,
    fn: (
      p: ScoreboardState['players'][number],
    ) => ScoreboardState['players'][number],
  ): void {
    this.state.update((s) => ({
      ...s,
      players: s.players.map((p, i) =>
        i === index ? fn(p) : p,
      ),
    }));
  }
}
