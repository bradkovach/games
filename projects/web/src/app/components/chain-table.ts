import {
  ChangeDetectionStrategy,
  Component,
  input,
} from '@angular/core';
import {
  CHAIN_NAMES,
  type ChainCounts,
  type ChainSummary,
} from 'engine';

import { TickerComponent } from './ticker';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TickerComponent],
  selector: 'app-chain-table',
  styles: `
    tr.inactive td,
    td.zero {
      color: var(--muted);
    }
  `,
  template: `
    <table>
      <thead>
        <tr>
          <th>Chain</th>
          <th class="figure">Size</th>
          <th class="num">Price</th>
          <th class="figure">Bank</th>
          @if (mine()) {
            <th class="figure">You</th>
          }
        </tr>
      </thead>
      <tbody>
        @for (chain of chains(); track chain.chain) {
          <tr [class.inactive]="!chain.active">
            <th
              scope="row"
              class="chain narrow chain-{{ chain.chain }}"
            >
              {{ names[chain.chain] }}
            </th>
            <td class="figure">
              {{ chain.size || '–' }}
              @if (chain.safe) {
                <span
                  class="glyph-text"
                  title="Safe; chain size > 10"
                  >{{ lockIcon }}</span
                >
              }
            </td>
            <td class="num">
              @if (chain.price) {
                <app-ticker
                  format="currency"
                  [value]="chain.price"
                />
              } @else {
                –
              }
            </td>
            <td class="figure">
              <app-ticker [value]="chain.bank" />
            </td>
            @if (mine(); as mine) {
              <td
                class="figure"
                [class.zero]="!mine[chain.chain]"
              >
                <app-ticker [value]="mine[chain.chain]" />
              </td>
            }
          </tr>
        }
      </tbody>
    </table>
  `,
})
export class ChainTableComponent {
  readonly chains = input.required<ChainSummary[]>();
  readonly lockIcon = '\u{1F512}\u{FE0E}';
  readonly mine = input<ChainCounts | null>(null);
  protected readonly names = CHAIN_NAMES;
}
