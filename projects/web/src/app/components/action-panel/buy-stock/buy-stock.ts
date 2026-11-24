import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import {
  CHAIN_NAMES,
  type ChainId,
  MAX_PURCHASE,
  type PlayerView,
} from 'engine';

import { GameClient } from '../../../services/game-client';
import { StepperComponent } from '../../stepper/stepper';
import { TickerComponent } from '../../ticker/ticker';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, StepperComponent, TickerComponent],
  selector: 'app-buy-stock',
  styles: `
    .padding-0 {
      padding: 0;
    }
    .figure {
      text-align: center;
    }
    .num {
      text-align: right;
    }
    tfoot td,
    tfoot th {
      padding: 1rem 0.4rem;
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
  `,
  template: `
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
        @for (c of view().chains; track c.chain) {
          @if (c.active) {
            @let owned = view().me.stock[c.chain];
            <tr>
              <th scope="row" class="chain chain-{{ c.chain }}">
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
                title="Your stock. {{ owned }} shares worth {{
                  '$'
                }}{{ owned * c.price | number: '1.0-0' }}"
              >
                {{ owned || '-' }}
              </td>
              <td class="padding-0">
                <app-stepper
                  [canDecrement]="!!buys()[c.chain]"
                  [canIncrement]="canBuy(c.chain)"
                  [text]="
                    buys()[c.chain] ? '' + buys()[c.chain] : '-'
                  "
                  [value]="buys()[c.chain] ?? 0"
                  (decrement)="adjust(c.chain, -1)"
                  (increment)="adjust(c.chain, 1)"
                />
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
              [value]="view().me.cash"
            />.
          </td>
          <td class="figure">{{ totalBuys() }}</td>
          <td class="num">\${{ cost() | number: '1.0-0' }}</td>
        </tr>
      </tfoot>
    </table>
    <div class="row">
      <button type="button" (click)="endTurn()">
        {{ view().endDeclared ? 'Finish game' : 'End turn' }}
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
  `,
})
export class BuyStockComponent {
  readonly view = input.required<PlayerView>();
  protected readonly buys = signal<
    Partial<Record<ChainId, number>>
  >({});
  protected readonly canDeclare = computed(
    () => this.view().canDeclareEnd && !this.view().endDeclared,
  );
  protected readonly client = inject(GameClient);
  protected readonly cost = computed(() =>
    this.view().chains.reduce(
      (sum, c) => sum + (this.buys()[c.chain] ?? 0) * c.price,
      0,
    ),
  );
  protected readonly discard = signal(true);
  /** Whether any active chain has shares left in the bank. */
  protected readonly forSale = computed(() =>
    this.view().chains.some((c) => c.active && c.bank > 0),
  );
  protected readonly names = CHAIN_NAMES;
  protected readonly totalBuys = computed(() =>
    Object.values(this.buys()).reduce(
      (sum, count) => sum + (count ?? 0),
      0,
    ),
  );

  protected adjust(chain: ChainId, delta: number): void {
    this.buys.update((b) => ({
      ...b,
      [chain]: (b[chain] ?? 0) + delta,
    }));
  }

  protected canBuy(chain: ChainId): boolean {
    const view = this.view();
    const summary = view.chains.find((c) => c.chain === chain);
    if (!summary) return false;
    return (
      this.totalBuys() < MAX_PURCHASE &&
      (this.buys()[chain] ?? 0) < summary.bank &&
      this.cost() + summary.price <= view.me.cash
    );
  }

  protected declare(): void {
    if (
      !confirm(
        'Declare the end of the game and finish your turn with the shares selected?',
      )
    ) {
      return;
    }
    this.client.send({ type: 'declareEnd' });
    // The turn's buying step is the last one, so finish it too.
    this.endTurn();
  }

  protected endTurn(): void {
    this.client.send({
      type: 'endTurn',
      discardDead: this.discard(),
      purchases: this.buys(),
    });
  }
}
