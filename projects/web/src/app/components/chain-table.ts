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

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-chain-table',
  styles: [
    `
      .muted {
        color: #999;
      }
      th.chain {
        color: #fff;
        text-shadow: 0 1px 1px rgb(0 0 0 / 40%);
      }
    `,
  ],
  template: `
    <table>
      <thead>
        <tr>
          <th>Chain</th>
          <th class="num">Size</th>
          <th class="num">Price</th>
          <th class="num">Bank</th>
          @if (mine()) {
            <th class="num">Yours</th>
          }
        </tr>
      </thead>
      <tbody>
        @for (chain of chains(); track chain.chain) {
          <tr [class.muted]="!chain.active">
            <th
              scope="row"
              class="chain chain-{{ chain.chain }}"
            >
              @if (chain.safe) {
                <span title="Safe; chain size > 10">{{
                  lockIcon
                }}</span>
              }
              {{ names[chain.chain] }}
            </th>
            <td class="num">{{ chain.size || '–' }}</td>
            <td class="num">
              {{ chain.price ? '$' + chain.price : '–' }}
            </td>
            <td class="num">{{ chain.bank }}</td>
            @if (mine(); as mine) {
              <td class="num">{{ mine[chain.chain] || '' }}</td>
            }
          </tr>
        }
      </tbody>
    </table>
  `,
})
export class ChainTableComponent {
  readonly lockIcon = '\u{1F512}\u{FE0E}';
  readonly chains = input.required<ChainSummary[]>();
  readonly mine = input<ChainCounts | null>(null);
  protected readonly names = CHAIN_NAMES;
}
