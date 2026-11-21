import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import {
  CHAIN_NAMES,
  type ChainId,
  MAX_PURCHASE,
  type PlayerView,
} from 'engine';

import { GameClient } from '../services/game-client';
import { DecimalPipe } from '@angular/common';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-action-panel',
  imports: [DecimalPipe],
  styles: `
    .buy {
      display: grid;
      gap: 0.3rem;
      grid-template-columns: auto 1fr auto;
      margin: 0.5rem 0;
    }
    .chain {
      color: #fff;
      text-shadow: 0 1px 1px rgb(0 0 0 / 40%);
    }
    .padding-0 {
      padding: 0;
    }

    .figure {
      text-align: center;
    }
    .num {
      text-align: right;
    }

    /* actions container */
    .actions {
      display: flex;
      gap: 0.5rem;
    }

    /* shrinks in main axis; fills cross axis, centered */
    /* should have buttons and text, centered */
    /* [button][ <- text -> ][button] */
    .actions .actions__action {
      display: flex;
      align-items: center;
      justify-content: center;
      /* reset button to a simple grey, no borders */
      background: #ddd;
      border: none;
      color: #000;
      border-radius: 0;
      cursor: pointer;
      padding: 0.3rem 0.5rem;
      &:hover {
        background: #eee;
      }
    }
    .actions .actions__action[disabled] {
      background: #ccc;
    }
    .actions .actions__action + .actions__action {
      border-left: 1px solid #ccc;
    }

    /* stretches in main axis; fills cross axis, centered */
    .actions .actions__text {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .actions .actions__text--numeric {
      text-align: right;
      /* use tabular numbers to prevent shifting */
      font-variant-numeric: tabular-nums;
    }

    tfoot td,
    tfoot th {
      padding: 1rem 0.4rem;
    }
  `,
  template: `
    @if (view(); as view) {
      @switch (myPhase()?.kind) {
        @case ('placeTile') {
          <h3>Your turn: place a tile</h3>
          <p class="muted">
            Click a highlighted tile on the board.
          </p>
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
        }
        @case ('foundChain') {
          <h3>Found a new chain</h3>
          <div class="row">
            @for (c of available(); track c) {
              <button
                type="button"
                class="chip chain-{{ c }}"
                (click)="
                  client.send({ chain: c, type: 'foundChain' })
                "
              >
                {{ names[c] }}
              </button>
            }
          </div>
        }
        @case ('chooseSurvivor') {
          <h3>Choose the surviving chain</h3>
          <div class="row">
            @for (c of candidates(); track c) {
              <button
                type="button"
                class="chip chain-{{ c }}"
                (click)="
                  client.send({
                    chain: c,
                    type: 'chooseSurvivor',
                  })
                "
              >
                {{ names[c] }}
              </button>
            }
          </div>
        }
        @case ('chooseAcquired') {
          <h3>Choose which chain is acquired next</h3>
          <div class="row">
            @for (c of candidates(); track c) {
              <button
                type="button"
                class="chip chain-{{ c }}"
                (click)="
                  client.send({
                    chain: c,
                    type: 'chooseAcquired',
                  })
                "
              >
                {{ names[c] }}
              </button>
            }
          </div>
        }
        @case ('disposeStock') {
          @if (dispose(); as d) {
            <h3>
              {{ names[d.acquired] }} was acquired by
              {{ names[d.survivor] }}
            </h3>
            <p>
              You hold {{ d.owned }} shares (\${{
                d.price
              }}
              each). Trades are 2 {{ names[d.acquired] }} → 1
              {{ names[d.survivor] }}.
            </p>
            <div class="row">
              <label
                >Sell
                <input
                  type="number"
                  min="0"
                  [max]="d.owned"
                  [value]="sell()"
                  (input)="sell.set(num($event))"
              /></label>
              <label
                >Trade
                <input
                  type="number"
                  min="0"
                  step="2"
                  [max]="d.maxTrade"
                  [value]="trade()"
                  (input)="trade.set(num($event))"
              /></label>
              <span class="muted"
                >Keep {{ d.owned - sell() - trade() }}</span
              >
            </div>
            <p>
              <button
                type="button"
                [disabled]="!disposeValid()"
                (click)="submitDispose()"
              >
                Confirm
              </button>
            </p>
          }
        }
        @case ('buyStock') {
          <h3>Buy up to 3 shares</h3>
          <table>
            <thead>
              <tr>
                <th>Chain</th>
                <th class="figure">Bank</th>
                <th class="num">$/sh.</th>
                <th class="figure">You</th>
                <th class="figure">Buy</th>
                <th class="figure">Total</th>
              </tr>
            </thead>
            <tbody>
              @for (c of view.chains; track c.chain) {
                @if (c.active) {
                  @let owned = view.me.stock[c.chain];
                  <tr>
                    <th
                      scope="row"
                      class="chain chain-{{ c.chain }}"
                    >
                      {{ names[c.chain] }}
                    </th>
                    <td class="figure">{{ c.bank }}</td>
                    <td class="num">
                      \${{ c.price | number: '1.0-0' }}
                    </td>
                    <td
                      class="figure"
                      [class.text-muted]="owned === 0"
                      title="Your stock. {{
                        owned
                      }} shares worth {{ '$' }}{{
                        owned * c.price | number: '1.0-0'
                      }}"
                    >
                      {{ owned || '-' }}
                    </td>
                    <td class="padding-0 actions">
                      <button
                        type="button"
                        class="actions__action"
                        [disabled]="!buys()[c.chain]"
                        (click)="adjust(c.chain, -1)"
                      >
                        −
                      </button>
                      <span
                        class="actions__text actions__text--numeric"
                        >{{ buys()[c.chain] || '-' }}</span
                      >
                      <button
                        type="button"
                        class="actions__action"
                        [disabled]="!canBuy(c.chain)"
                        (click)="adjust(c.chain, 1)"
                      >
                        +
                      </button>
                    </td>
                    <td class="num">
                      \${{
                        (buys()[c.chain] || 0) * c.price
                          | number: '1.0-0'
                      }}
                    </td>
                  </tr>
                }
              }
            </tbody>
            <tfoot>
              <tr>
                <td colspan="4">
                  You have {{ '$'
                  }}{{ view.me.cash | number: '1.0-0' }}.
                </td>
                <td class="figure">{{ totalBuys() }}</td>
                <td class="num">
                  \${{ cost() | number: '1.0-0' }}
                </td>
              </tr>
            </tfoot>
          </table>
          <div class="row">
            <button type="button" (click)="endTurn()">
              {{ view.endDeclared ? 'Finish game' : 'End turn' }}
            </button>
            <label class="muted"
              ><input
                type="checkbox"
                [checked]="discard()"
                (change)="discard.set(!discard())"
              />
              discard dead tiles</label
            >
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
        }
        @default {
          @if (view.phase.kind === 'gameOver') {
            <h3>Game over</h3>
          } @else if (waitingOn(); as name) {
            <p class="muted">Waiting for {{ name }}…</p>
          }
        }
      }
      @if (client.error(); as error) {
        <p class="error">{{ error }}</p>
      }
    }
  `,
})
export class ActionPanelComponent {
  protected readonly client = inject(GameClient);
  protected readonly view = computed(() => {
    const view = this.client.view();
    return view && 'me' in view ? (view as PlayerView) : null;
  });

  protected readonly available = computed(() =>
    (this.view()?.chains ?? [])
      .filter((c) => !c.active)
      .map((c) => c.chain),
  );

  protected readonly buys = signal<
    Partial<Record<ChainId, number>>
  >({});

  readonly totalBuys = computed(() =>
    Object.values(this.buys()).reduce((a, b) => a + b, 0),
  );
  protected readonly canDeclare = computed(() => {
    const view = this.view();
    return !!view && view.canDeclareEnd && !view.endDeclared;
  });
  protected readonly myPhase = computed(() => {
    const view = this.view();
    if (!view) return null;
    const { phase } = view;
    return 'playerId' in phase && phase.playerId === view.me.id
      ? phase
      : null;
  });
  protected readonly candidates = computed(() => {
    const phase = this.myPhase();
    return phase && 'candidates' in phase
      ? phase.candidates
      : [];
  });
  protected readonly cost = computed(() => {
    const view = this.view();
    if (!view) return 0;
    return view.chains.reduce(
      (sum, c) => sum + (this.buys()[c.chain] ?? 0) * c.price,
      0,
    );
  });
  protected readonly discard = signal(true);

  protected readonly dispose = computed(() => {
    const phase = this.myPhase();
    const view = this.view();
    if (!view || phase?.kind !== 'disposeStock') return null;
    const owned = view.me.stock[phase.acquired];
    const bank =
      view.chains.find((c) => c.chain === phase.survivor)
        ?.bank ?? 0;
    return {
      acquired: phase.acquired,
      maxTrade: Math.min(owned - (owned % 2), bank * 2),
      owned,
      price:
        view.chains.find((c) => c.chain === phase.acquired)
          ?.price ?? 0,
      survivor: phase.survivor,
    };
  });

  protected readonly sell = signal(0);

  protected readonly trade = signal(0);
  protected readonly disposeValid = computed(() => {
    const d = this.dispose();
    const sell = this.sell();
    const trade = this.trade();
    return (
      !!d &&
      sell >= 0 &&
      trade >= 0 &&
      trade % 2 === 0 &&
      trade <= d.maxTrade &&
      sell + trade <= d.owned
    );
  });
  protected readonly hasPlayable = computed(() =>
    (this.view()?.me.hand ?? []).some(
      (t) => t.status === 'playable',
    ),
  );
  protected readonly names = CHAIN_NAMES;

  protected readonly waitingOn = computed(() => {
    const phase = this.client.view()?.phase;
    return phase && 'playerId' in phase
      ? (this.client.names().get(phase.playerId) ??
          'another player')
      : null;
  });

  constructor() {
    // Reset local inputs whenever the decision changes.
    effect(() => {
      this.myPhase();
      this.buys.set({});
      this.sell.set(0);
      this.trade.set(0);
    });
  }

  protected adjust(chain: ChainId, delta: number): void {
    this.buys.update((b) => ({
      ...b,
      [chain]: (b[chain] ?? 0) + delta,
    }));
  }

  protected canBuy(chain: ChainId): boolean {
    const view = this.view();
    const summary = view?.chains.find((c) => c.chain === chain);
    if (!view || !summary) return false;
    const total = Object.values(this.buys()).reduce(
      (a, b) => a + (b ?? 0),
      0,
    );
    return (
      total < MAX_PURCHASE &&
      (this.buys()[chain] ?? 0) < summary.bank &&
      this.cost() + summary.price <= view.me.cash
    );
  }

  protected declare(): void {
    if (confirm('Declare the end of the game?')) {
      this.client.send({ type: 'declareEnd' });
    }
  }

  protected endTurn(): void {
    this.client.send({
      discardDead: this.discard(),
      purchases: this.buys(),
      type: 'endTurn',
    });
  }

  protected num(event: Event): number {
    return Math.max(
      0,
      Math.floor(
        Number((event.target as HTMLInputElement).value) || 0,
      ),
    );
  }

  protected submitDispose(): void {
    this.client.send({
      sell: this.sell(),
      trade: this.trade(),
      type: 'disposeStock',
    });
  }
}
