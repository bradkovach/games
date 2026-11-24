import { DecimalPipe } from '@angular/common';
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

import { GameClient } from '../../services/game-client';
import { PreferencesService } from '../../services/preferences';
import { TickerComponent } from '../ticker/ticker';
import { TILE_HINTS } from '../tile-hints';

/** Time to cancel before an automatic end of turn. */
export const AUTO_END_DELAY_MS = 1500;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, TickerComponent],
  selector: 'app-action-panel',
  styles: `
    .buy {
      display: grid;
      gap: 0.3rem;
      grid-template-columns: auto 1fr auto;
      margin: 0.5rem 0;
    }
    .padding-0 {
      padding: 0;
    }
    @media (max-width: 480px) {
      table {
        font-size: 0.85rem;
      }
      th,
      td {
        padding: 0.25rem 0.2rem;
      }
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
      background: var(--neutral);
      border: none;
      color: var(--ink);
      border-radius: 0;
      padding: 0.3rem 0.5rem;
      &:hover:not(:disabled) {
        background: var(--neutral-hover);
      }
    }
    .actions .actions__action + .actions__action {
      border-left: 1px solid var(--line);
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

    .auto-end {
      align-items: center;
      display: flex;
      gap: 0.5rem;
    }
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
    .dispose .actions {
      min-width: 7rem;
    }
    .prices {
      align-items: baseline;
      display: grid;
      gap: 0.25rem 0.6rem;
      grid-template-columns: auto 1fr;
      margin: 0.5rem 0;
    }
    .prices dd {
      margin: 0;
    }
    .net {
      font-size: 1.15rem;
      font-weight: 700;
    }
    .gain {
      color: var(--up);
    }
    .loss {
      color: var(--down);
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
            {{
              prefs.hideBoard()
                ? 'Choose a tile to place.'
                : 'Choose a tile, or click a highlighted tile on the board.'
            }}
          </p>
          <div class="hand" role="group" aria-label="Your tiles">
            @for (t of view.me.hand; track t.tile) {
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
                  client.send({
                    tile: t.tile,
                    type: 'placeTile',
                  })
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
              You hold {{ d.owned }}
              {{ names[d.acquired] }} shares.
            </p>
            <dl class="prices">
              <dt>
                <span class="chain chain-{{ d.acquired }}">{{
                  names[d.acquired]
                }}</span>
              </dt>
              <dd>
                \${{ d.price | number: '1.0-0' }}/share; selling
                2 pays \${{ d.price * 2 | number: '1.0-0' }}
              </dd>
              <dt>
                <span class="chain chain-{{ d.survivor }}">{{
                  names[d.survivor]
                }}</span>
              </dt>
              <dd>
                \${{ d.survivorPrice | number: '1.0-0' }}/share;
                2-for-1 trade
                <span
                  [class.gain]="d.tradeEdge > 0"
                  [class.loss]="d.tradeEdge < 0"
                  >{{ d.tradeEdge >= 0 ? '+' : '−' }}\${{
                    abs(d.tradeEdge) | number: '1.0-0'
                  }}</span
                >
                vs. selling
              </dd>
            </dl>
            <table class="dispose">
              <thead>
                <tr>
                  <th></th>
                  <th class="figure">Shares</th>
                  <th class="num">Value</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Sell</th>
                  <td class="padding-0 actions">
                    <button
                      type="button"
                      class="actions__action"
                      aria-label="Sell one fewer"
                      [disabled]="sell() === 0"
                      (click)="sell.set(sell() - 1)"
                    >
                      −
                    </button>
                    <span
                      class="actions__text actions__text--numeric"
                      >{{ sell() }}</span
                    >
                    <button
                      type="button"
                      class="actions__action"
                      aria-label="Sell one more"
                      [disabled]="sell() + trade() >= d.owned"
                      (click)="sell.set(sell() + 1)"
                    >
                      +
                    </button>
                  </td>
                  <td class="num">
                    \${{ sell() * d.price | number: '1.0-0' }}
                  </td>
                </tr>
                <tr>
                  <th scope="row">Trade</th>
                  <td class="padding-0 actions">
                    <button
                      type="button"
                      class="actions__action"
                      aria-label="Trade two fewer"
                      [disabled]="trade() === 0"
                      (click)="trade.set(trade() - 2)"
                    >
                      −
                    </button>
                    <span
                      class="actions__text actions__text--numeric"
                      >{{ trade() }}</span
                    >
                    <button
                      type="button"
                      class="actions__action"
                      aria-label="Trade two more"
                      [disabled]="
                        trade() + 2 > d.maxTrade ||
                        sell() + trade() + 2 > d.owned
                      "
                      (click)="trade.set(trade() + 2)"
                    >
                      +
                    </button>
                  </td>
                  <td class="num">
                    {{ trade() / 2 }}
                    <span class="chain chain-{{ d.survivor }}">{{
                      names[d.survivor]
                    }}</span>
                    <br />
                    \${{
                      disposeValue().traded | number: '1.0-0'
                    }}
                  </td>
                </tr>
                <tr>
                  <th scope="row">Keep</th>
                  <td class="figure keep">
                    {{ d.owned - sell() - trade() }}
                  </td>
                  <td></td>
                </tr>
              </tbody>
            </table>
            <p class="net">
              Net change vs. holding:
              <app-ticker
                format="currency"
                signed
                [class.gain]="disposeValue().net > 0"
                [class.loss]="disposeValue().net < 0"
                [value]="disposeValue().net"
              />
            </p>
            <p class="muted">
              Cash +\${{ disposeValue().cash | number: '1.0-0' }}
              now. Values use today's prices;
              {{ names[d.survivor] }} usually rises once the
              merger grows it.
            </p>
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
          @if (!forSale()) {
            <p class="muted no-shares">
              There are no shares available for purchase.
            </p>
          }
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
                      <app-ticker
                        format="currency"
                        [value]="c.price"
                      />
                    </td>
                    <td
                      class="figure"
                      [class.muted]="owned === 0"
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
                  You have
                  <app-ticker
                    format="currency"
                    [value]="view.me.cash"
                  />.
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
          } @else if (waitingOn(); as who) {
            <p class="muted">
              Waiting for
              @if (who.avatar) {
                <span class="emoji" aria-hidden="true">{{
                  who.avatar
                }}</span>
              }
              {{ who.name }}…
            </p>
          }
        }
      }
      @if (autoEndPending()) {
        <p class="auto-end" role="status">
          Nothing to do — ending your turn…
          <button
            type="button"
            class="secondary"
            (click)="cancelAutoEnd()"
          >
            Cancel
          </button>
        </p>
      }
      @if (autoEndHeld()) {
        <p class="auto-end held" role="status">
          You have no other moves, but your turn wasn't ended
          automatically because
          {{
            view.endDeclared
              ? 'ending it finishes the game.'
              : 'you can declare the game over.'
          }}
        </p>
      }
      @if (client.error(); as error) {
        <p class="error">{{ error }}</p>
      }
    }
  `,
})
export class ActionPanelComponent {
  protected readonly buys = signal<
    Partial<Record<ChainId, number>>
  >({});
  readonly totalBuys = computed(() =>
    Object.values(this.buys()).reduce(
      (sum, count) => sum + (count ?? 0),
      0,
    ),
  );

  protected readonly abs = Math.abs;

  protected readonly client = inject(GameClient);

  protected readonly view = computed(() => {
    const view = this.client.view();
    return view && 'me' in view ? (view as PlayerView) : null;
  });
  protected readonly hasPlayable = computed(() =>
    (this.view()?.me.hand ?? []).some(
      (t) => t.status === 'playable',
    ),
  );
  protected readonly myPhase = computed(() => {
    const view = this.view();
    if (!view) return null;
    const { phase } = view;
    return 'playerId' in phase && phase.playerId === view.me.id
      ? phase
      : null;
  });
  /**
   * The only move left: skipping placement with no playable tile,
   * or ending the turn when no share is affordable.
   */
  protected readonly forcedAction = computed(
    (): 'endTurn' | 'passPlacement' | null => {
      const view = this.view();
      const phase = this.myPhase();
      if (!view || !phase) return null;
      if (phase.kind === 'placeTile' && !this.hasPlayable()) {
        return 'passPlacement';
      }
      if (
        phase.kind === 'buyStock' &&
        !view.chains.some(
          (c) =>
            c.active && c.bank > 0 && c.price <= view.me.cash,
        )
      ) {
        return 'endTurn';
      }
      return null;
    },
  );
  protected readonly prefs = inject(PreferencesService);
  /**
   * Auto-end never fires while declaring the end is possible, so
   * the player keeps the choice to finish the game.
   */
  protected readonly autoEndHeld = computed(() => {
    const view = this.view();
    return (
      this.prefs.autoEndTurn() &&
      !!this.forcedAction() &&
      !!view &&
      (view.canDeclareEnd || view.endDeclared)
    );
  });
  protected readonly autoAction = computed(() =>
    this.prefs.autoEndTurn() && !this.autoEndHeld()
      ? this.forcedAction()
      : null,
  );
  protected readonly autoEndPending = signal(false);
  protected readonly available = computed(() =>
    (this.view()?.chains ?? [])
      .filter((c) => !c.active)
      .map((c) => c.chain),
  );

  protected readonly canDeclare = computed(() => {
    const view = this.view();
    return !!view && view.canDeclareEnd && !view.endDeclared;
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
  /**
   * Identifies the decision being made. Every server message builds
   * a new phase object, so the inputs reset on this string instead.
   */
  protected readonly decisionKey = computed(() => {
    const phase = this.myPhase();
    if (!phase) return '';
    return 'acquired' in phase
      ? `${phase.kind}:${phase.acquired}`
      : phase.kind;
  });
  protected readonly discard = signal(true);
  protected readonly dispose = computed(() => {
    const phase = this.myPhase();
    const view = this.view();
    if (!view || phase?.kind !== 'disposeStock') return null;
    const owned = view.me.stock[phase.acquired];
    const chainOf = (chain: string) =>
      view.chains.find((c) => c.chain === chain);
    const bank = chainOf(phase.survivor)?.bank ?? 0;
    const price = chainOf(phase.acquired)?.price ?? 0;
    const survivorPrice = chainOf(phase.survivor)?.price ?? 0;
    return {
      acquired: phase.acquired,
      maxTrade: Math.min(owned - (owned % 2), bank * 2),
      owned,
      price,
      survivor: phase.survivor,
      survivorPrice,
      /** What one 2-for-1 trade gains over selling both shares. */
      tradeEdge: survivorPrice - price * 2,
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
  /**
   * The configured disposal in dollars: cash from sales, the value
   * of the survivor shares received, and the net change compared
   * with holding the same shares at today's price.
   */
  protected readonly disposeValue = computed(() => {
    const d = this.dispose();
    const sell = this.sell();
    const trade = this.trade();
    if (!d) return { cash: 0, net: 0, traded: 0 };
    const traded = (trade / 2) * d.survivorPrice;
    return {
      cash: sell * d.price,
      net: traded - trade * d.price,
      traded,
    };
  });
  /** Whether any active chain has shares left in the bank. */
  protected readonly forSale = computed(
    () =>
      this.view()?.chains.some((c) => c.active && c.bank > 0) ??
      false,
  );
  protected readonly hints = TILE_HINTS;
  protected readonly names = CHAIN_NAMES;
  protected readonly waitingOn = computed(() => {
    const phase = this.client.view()?.phase;
    if (!phase || !('playerId' in phase)) return null;
    return {
      avatar: this.client.avatars().get(phase.playerId),
      name:
        this.client.names().get(phase.playerId) ??
        'another player',
    };
  });

  /** Decision for which the player cancelled auto-end. */
  private readonly autoEndCancelled = signal<null | string>(
    null,
  );

  constructor() {
    // Reset local inputs whenever the decision changes.
    effect(() => {
      this.decisionKey();
      this.buys.set({});
      this.sell.set(0);
      this.trade.set(0);
      this.autoEndCancelled.set(null);
    });

    effect((onCleanup) => {
      const action = this.autoAction();
      const key = this.decisionKey();
      if (!action || this.autoEndCancelled() === key) {
        this.autoEndPending.set(false);
        return;
      }
      this.autoEndPending.set(true);
      const timer = setTimeout(() => {
        this.autoEndPending.set(false);
        if (action === 'endTurn') this.endTurn();
        else this.client.send({ type: 'passPlacement' });
      }, AUTO_END_DELAY_MS);
      onCleanup(() => clearTimeout(timer));
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
    return (
      this.totalBuys() < MAX_PURCHASE &&
      (this.buys()[chain] ?? 0) < summary.bank &&
      this.cost() + summary.price <= view.me.cash
    );
  }

  protected cancelAutoEnd(): void {
    this.autoEndCancelled.set(this.decisionKey());
  }

  protected declare(): void {
    const buying = this.myPhase()?.kind === 'buyStock';
    const prompt = buying
      ? 'Declare the end of the game and finish your turn with the shares selected?'
      : 'Declare the end of the game?';
    if (!confirm(prompt)) return;
    this.client.send({ type: 'declareEnd' });
    // The turn's buying step is the last one, so finish it too.
    if (buying) this.endTurn();
  }

  protected endTurn(): void {
    this.client.send({
      type: 'endTurn',
      discardDead: this.discard(),
      purchases: this.buys(),
    });
  }

  protected submitDispose(): void {
    this.client.send({
      type: 'disposeStock',
      sell: this.sell(),
      trade: this.trade(),
    });
  }
}
