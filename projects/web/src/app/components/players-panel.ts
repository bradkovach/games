import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import {
  CHAIN_ABBRS,
  CHAIN_NAMES,
  ChainId,
  CHAINS,
  GameMode,
  type PlayerSummary,
} from 'engine';

interface StockRank {
  primary: number;
  secondary: number;
  tertiary?: number;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe],
  selector: 'app-players-panel',
  styles: `
    li {
      padding: 0.25rem 0;
    }
    .turn {
      font-weight: 700;
    }
    .primary {
      background-color: gold;
    }
    .secondary {
      background-color: silver;
    }
    .tertiary {
      background-color: #cd7f32;
    }
    th.chain {
      text-align: center;
      color: #fff;
      text-shadow: 0 1px 1px rgb(0 0 0 / 40%);
    }
  `,
  template: `
    <table>
      <thead>
        <tr>
          <th><span class="visually-hidden">Turn</span></th>
          <th>Player</th>
          @if (!isSecretGame()) {
            <th class="num">$</th>
            @for (chain of chains; track chain) {
              <th
                class="text-center chain chain-{{ chain }}"
                title="{{ names[chain] }}"
              >
                {{ abbrs[chain] }}
              </th>
            }
          }
        </tr>
      </thead>
      <tbody>
        @for (player of players(); track player.id) {
          <tr [class.turn]="player.id === active()">
            <td>{{ player.id === active() ? '▶' : '' }}</td>
            <td>{{ player.name }}</td>
            @if (!isSecretGame()) {
              <td class="num">
                {{ player.cash || 0 | number: '1.0-0' }}
              </td>
            }
            @if (player.stock; as stock) {
              @for (chain of chains; track chain) {
                @let r = ranks();
                <td
                  class="num"
                  [class.primary]="
                    r[chain].primary &&
                    stock[chain] === r[chain].primary
                  "
                  [class.secondary]="
                    r[chain].secondary &&
                    stock[chain] === r[chain].secondary
                  "
                  [class.tertiary]="
                    gameMode() === 'tycoon' &&
                    r[chain].tertiary &&
                    stock[chain] === r[chain].tertiary
                  "
                >
                  {{ stock[chain] || 0 }}
                </td>
              }
            }
          </tr>
        }
      </tbody>
    </table>
  `,
})
export class PlayersPanelComponent {
  readonly gameMode = input.required<GameMode>();
  readonly active = input<null | string>(null);
  readonly players = input.required<PlayerSummary[]>();
  readonly you = input<null | string>(null);
  protected readonly chains = CHAINS;
  protected readonly names = CHAIN_NAMES;
  protected readonly abbrs = CHAIN_ABBRS;
  readonly isSecretGame = computed(() =>
    this.players().every(
      (p) => p.cash === undefined && p.stock === undefined,
    ),
  );

  readonly ranks = computed((): Record<ChainId, StockRank> => {
    const result = {} as Partial<Record<ChainId, StockRank>>;
    for (const chain of CHAINS) {
      const [primary, secondary, tertiary] = this.players()
        .map((p) => p.stock?.[chain] || 0)
        .sort((a, b) => b - a);
      result[chain] = { primary, secondary, tertiary };
    }
    return result as Record<ChainId, StockRank>;
  });
}
