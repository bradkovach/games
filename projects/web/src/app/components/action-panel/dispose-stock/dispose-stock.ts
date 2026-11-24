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
  type PlayerView,
} from 'engine';

import { GameClient } from '../../../services/game-client';
import { StepperComponent } from '../../stepper/stepper';
import { TickerComponent } from '../../ticker/ticker';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, StepperComponent, TickerComponent],
  selector: 'app-dispose-stock',
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
    @if (details(); as d) {
      <h3>
        {{ names[d.acquired] }} was acquired by
        {{ names[d.survivor] }}
      </h3>
      <p>
        You hold {{ d.owned }} {{ names[d.acquired] }} shares.
      </p>
      <dl class="prices">
        <dt>
          <span class="chain chain-{{ d.acquired }}">{{
            names[d.acquired]
          }}</span>
        </dt>
        <dd>
          \${{ d.price | number: '1.0-0' }}/share; selling 2 pays
          \${{ d.price * 2 | number: '1.0-0' }}
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
            <td class="padding-0">
              <app-stepper
                decrementLabel="Sell one fewer"
                incrementLabel="Sell one more"
                [canDecrement]="sell() > 0"
                [canIncrement]="sell() + trade() < d.owned"
                [value]="sell()"
                (decrement)="sell.set(sell() - 1)"
                (increment)="sell.set(sell() + 1)"
              />
            </td>
            <td class="num">
              \${{ sell() * d.price | number: '1.0-0' }}
            </td>
          </tr>
          <tr>
            <th scope="row">Trade</th>
            <td class="padding-0">
              <app-stepper
                decrementLabel="Trade two fewer"
                incrementLabel="Trade two more"
                [canDecrement]="trade() > 0"
                [canIncrement]="
                  trade() + 2 <= d.maxTrade &&
                  sell() + trade() + 2 <= d.owned
                "
                [value]="trade()"
                (decrement)="trade.set(trade() - 2)"
                (increment)="trade.set(trade() + 2)"
              />
            </td>
            <td class="num">
              {{ trade() / 2 }}
              <span class="chain chain-{{ d.survivor }}">{{
                names[d.survivor]
              }}</span>
              <br />
              \${{ value().traded | number: '1.0-0' }}
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
          [class.gain]="value().net > 0"
          [class.loss]="value().net < 0"
          [value]="value().net"
        />
      </p>
      <p class="muted">
        Cash +\${{ value().cash | number: '1.0-0' }} now. Values
        use today's prices; {{ names[d.survivor] }} usually rises
        once the merger grows it.
      </p>
      <p>
        <button
          type="button"
          [disabled]="!valid()"
          (click)="submit()"
        >
          Confirm
        </button>
      </p>
    }
  `,
})
export class DisposeStockComponent {
  readonly acquired = input.required<ChainId>();
  readonly survivor = input.required<ChainId>();
  readonly view = input.required<PlayerView>();
  protected readonly abs = Math.abs;
  protected readonly client = inject(GameClient);
  protected readonly details = computed(() => {
    const view = this.view();
    const acquired = this.acquired();
    const survivor = this.survivor();
    const owned = view.me.stock[acquired];
    const chainOf = (chain: ChainId) =>
      view.chains.find((c) => c.chain === chain);
    const bank = chainOf(survivor)?.bank ?? 0;
    const price = chainOf(acquired)?.price ?? 0;
    const survivorPrice = chainOf(survivor)?.price ?? 0;
    return {
      acquired,
      maxTrade: Math.min(owned - (owned % 2), bank * 2),
      owned,
      price,
      survivor,
      survivorPrice,
      /** What one 2-for-1 trade gains over selling both shares. */
      tradeEdge: survivorPrice - price * 2,
    };
  });
  protected readonly names = CHAIN_NAMES;
  protected readonly sell = signal(0);

  protected readonly trade = signal(0);
  protected readonly valid = computed(() => {
    const d = this.details();
    const sell = this.sell();
    const trade = this.trade();
    return (
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
  protected readonly value = computed(() => {
    const d = this.details();
    const trade = this.trade();
    const traded = (trade / 2) * d.survivorPrice;
    return {
      cash: this.sell() * d.price,
      net: traded - trade * d.price,
      traded,
    };
  });

  protected submit(): void {
    this.client.send({
      type: 'disposeStock',
      sell: this.sell(),
      trade: this.trade(),
    });
  }
}
