import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import {
  CHAIN_NAMES,
  type ChainId,
  type GameResults,
  rankPlayers,
} from 'engine';

import { formatTicker } from './ticker';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-results-panel',
  template: `
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Player</th>
          <th class="num">Cash</th>
          <th class="num">+ Bonuses</th>
          <th class="num">+ Stock sales</th>
          <th class="num">= Net worth</th>
        </tr>
      </thead>
      <tbody>
        @for (row of rows(); track row.id) {
          <tr [style.font-weight]="row.place === 1 ? 700 : 400">
            <td>{{ row.place === 1 ? '🏆' : row.place }}</td>
            <td>{{ name()(row.id) }}</td>
            <td class="num">{{ money(row.startCash) }}</td>
            <td class="num">{{ money(row.bonuses) }}</td>
            <td class="num">{{ money(row.sales) }}</td>
            <td class="num">{{ money(row.cash) }}</td>
          </tr>
        }
      </tbody>
    </table>
    @for (entry of bonusLines(); track entry.chain) {
      <div class="muted">
        <span class="chip chain-{{ entry.chain }}">{{
          entry.label
        }}</span>
        {{ entry.text }}
      </div>
    }
  `,
})
export class ResultsPanelComponent {
  readonly name = input<(id: string) => string>((id) => id);
  readonly results = input.required<GameResults>();

  protected readonly money = (value: number) =>
    formatTicker(value, 'currency');

  protected readonly bonusLines = computed(() =>
    Object.entries(this.results().bonuses).map(
      ([chain, payouts]) => ({
        chain,
        label: CHAIN_NAMES[chain as ChainId],
        text: Object.entries(payouts ?? {})
          .map(
            ([id, amount]) =>
              `${this.name()(id)} ${this.money(amount ?? 0)}`,
          )
          .join(', '),
      }),
    ),
  );

  protected readonly rows = computed(() => {
    const results = this.results();
    return rankPlayers(results.finalCash).map((row) => {
      const bonuses = Object.values(results.bonuses).reduce(
        (sum, payouts) => sum + (payouts?.[row.id] ?? 0),
        0,
      );
      const sales = results.sales[row.id] ?? 0;
      return {
        ...row,
        bonuses,
        sales,
        startCash: row.cash - bonuses - sales,
      };
    });
  });
}
