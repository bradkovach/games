import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import {
  CHAIN_NAMES,
  type ChainCounts,
  type ChainId,
  CHAINS,
  type ChainSummary,
  type GameMode,
  type PlayerSummary,
} from 'engine';

import { TickerComponent } from './ticker';

export type Medal = 1 | 2 | 3;

const MEDAL_NAMES: Record<Medal, string> = {
  1: 'Majority holder',
  2: 'Minority holder',
  3: 'Third-largest holder',
};

const HIDDEN_HINT = 'Secret until the game ends';

interface Column {
  cash: number | undefined;
  id: string;
  name: string;
  stock: ChainCounts | undefined;
}

/**
 * The game's heads-up display: chain market data and every
 * player's holdings in a single table, so nothing is off-screen.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TickerComponent],
  selector: 'app-info-table',
  styles: `
    :host {
      display: block;
      overflow-x: auto;
    }
    table {
      font-size: 0.875rem;
      font-variant-numeric: tabular-nums;
    }
    th,
    td {
      padding: 0.2rem 0.25rem;
    }
    thead th {
      text-align: center;
      vertical-align: bottom;
    }
    thead th.label {
      font-size: 0.75rem;
      white-space: nowrap;
    }
    th.player {
      width: var(--player-width);
    }
    th.player.you .name {
      text-decoration: underline;
    }
    .avatar {
      font-size: 1.3rem;
      line-height: 1.2;
    }
    .name {
      display: block;
      font-weight: 700;
      margin-inline: auto;
      max-width: 5rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .marker {
      color: var(--accent);
      font-size: 0.7rem;
      vertical-align: middle;
    }
    /* Match the coin's height so ranked and plain rows align. */
    td {
      height: 1.5rem;
      line-height: 1.5rem;
      text-align: center;
      white-space: nowrap;
    }
    tbody th {
      line-height: 1.5rem;
    }
    td.market {
      color: var(--muted);
    }
    tr.inactive td,
    td.zero,
    td.hidden {
      color: var(--muted);
    }
    td.hidden {
      cursor: help;
    }
    th.cash {
      text-align: left;
    }
    /* A share count on a gold, silver or bronze coin. */
    .coin {
      --metal: var(--gold);
      align-items: center;
      background:
        radial-gradient(
          circle at 32% 28%,
          rgb(255 255 255 / 70%),
          transparent 45%
        ),
        radial-gradient(
          circle,
          var(--metal) 55%,
          color-mix(in srgb, var(--metal) 70%, #000) 100%
        );
      border-radius: 50%;
      box-shadow:
        inset 0 0 0 2px
          color-mix(in srgb, var(--metal) 60%, #000),
        0 1px 2px rgb(0 0 0 / 35%);
      color: #1e1a10;
      display: inline-flex;
      font-size: 0.75rem;
      font-weight: 700;
      height: 1.5rem;
      justify-content: center;
      overflow: hidden;
      position: relative;
      text-shadow: 0 1px 0 rgb(255 255 255 / 45%);
      vertical-align: middle;
      width: 1.5rem;
    }
    .coin.medal-2 {
      --metal: var(--silver);
    }
    .coin.medal-3 {
      --metal: var(--bronze);
    }
    /* An occasional, gentle gloss; never a call to act. */
    .coin::after {
      animation: coin-gloss 10s ease-in-out infinite;
      animation-delay: var(--gloss-delay, 0s);
      background: linear-gradient(
        115deg,
        transparent 35%,
        rgb(255 255 255 / 55%) 50%,
        transparent 65%
      );
      content: '';
      inset: 0;
      position: absolute;
      translate: -120% 0;
    }
    @keyframes coin-gloss {
      0%,
      88% {
        translate: -120% 0;
      }
      100% {
        translate: 120% 0;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .coin::after {
        animation: none;
        display: none;
      }
    }
  `,
  template: `
    <table [style.--player-width.%]="playerWidth()">
      <thead>
        <tr>
          <th class="label">Asset</th>
          <th class="label">Size</th>
          <th class="label">$/share</th>
          <th class="label" title="Shares left in the bank">
            Avail
          </th>
          @for (col of columns(); track col.id) {
            <th
              scope="col"
              class="player"
              [class.turn]="col.id === active()"
              [class.you]="col.id === you()"
              [title]="col.name"
            >
              @if (col.id === active()) {
                <span class="marker">
                  ▶<span class="visually-hidden"
                    >Current turn:</span
                  >
                </span>
              }
              @if (avatars().get(col.id); as avatar) {
                <span class="avatar emoji" aria-hidden="true">{{
                  avatar
                }}</span>
              }
              <span class="name">{{ col.name }}</span>
            </th>
          }
        </tr>
      </thead>
      <tbody>
        <tr>
          <th scope="row" colspan="4" class="cash">Cash</th>
          @for (col of columns(); track col.id) {
            @if (col.cash === undefined) {
              <td class="hidden" [title]="hiddenHint">–</td>
            } @else {
              <td>
                <app-ticker
                  format="currency"
                  [value]="col.cash"
                />
              </td>
            }
          }
        </tr>
        @for (
          c of chainRows();
          track c.chain;
          let row = $index
        ) {
          <tr [class.inactive]="!c.active">
            <th
              scope="row"
              class="chain narrow chain-{{ c.chain }}"
            >
              {{ names[c.chain] }}
            </th>
            <td class="market">
              {{ c.size || '–' }}
              @if (c.safe) {
                <span
                  class="glyph-text"
                  title="Safe; chain size > 10"
                  >{{ lockIcon }}</span
                >
              }
            </td>
            <td class="market">
              @if (c.price) {
                <app-ticker
                  format="currency"
                  [value]="c.price"
                />
              } @else {
                –
              }
            </td>
            <td class="market">
              <app-ticker [value]="c.bank" />
            </td>
            @for (
              col of columns();
              track col.id;
              let i = $index
            ) {
              @if (col.stock; as stock) {
                @let medal = medals()[c.chain]?.[col.id];
                <td [class.zero]="!stock[c.chain]">
                  @if (medal) {
                    <span
                      class="coin medal-{{ medal }}"
                      [style.--gloss-delay]="
                        (row + i) * 0.6 + 's'
                      "
                      [title]="medalNames[medal]"
                      [attr.aria-label]="
                        stock[c.chain] +
                        ' shares, ' +
                        medalNames[medal]
                      "
                      >{{ stock[c.chain] }}</span
                    >
                  } @else {
                    <app-ticker [value]="stock[c.chain]" />
                  }
                </td>
              } @else {
                <td class="hidden" [title]="hiddenHint">–</td>
              }
            }
          </tr>
        }
      </tbody>
    </table>
  `,
})
export class InfoTableComponent {
  readonly active = input<null | string>(null);
  readonly avatars = input<ReadonlyMap<string, string>>(
    new Map(),
  );
  readonly chains = input.required<readonly ChainSummary[]>();
  readonly gameMode = input.required<GameMode>();
  readonly lockIcon = '\u{1F512}\u{FE0E}';
  /** The viewer's private totals, used when holdings are secret. */
  readonly me = input<null | {
    cash: number;
    stock: ChainCounts;
  }>(null);
  readonly players = input.required<readonly PlayerSummary[]>();
  readonly you = input<null | string>(null);
  /** Every chain in board order, even before it is founded. */
  protected readonly chainRows = computed(() =>
    CHAINS.map(
      (chain): ChainSummary =>
        this.chains().find((c) => c.chain === chain) ?? {
          active: false,
          bank: 25,
          chain,
          price: 0,
          safe: false,
          size: 0,
        },
    ),
  );
  protected readonly columns = computed((): Column[] => {
    const me = this.me();
    const you = this.you();
    return this.players().map((p) => {
      const own = p.id === you && me ? me : null;
      return {
        id: p.id,
        cash: p.cash ?? own?.cash,
        name: p.name,
        stock: p.stock ?? own?.stock,
      };
    });
  });
  protected readonly hiddenHint = HIDDEN_HINT;
  protected readonly medalNames = MEDAL_NAMES;
  /** Ranks need everyone's holdings, so secret games have none. */
  protected readonly medals = computed(() =>
    this.players().every((p) => p.stock !== undefined)
      ? stockMedals(
          this.players(),
          this.chains(),
          this.gameMode(),
        )
      : {},
  );
  protected readonly names = CHAIN_NAMES;
  protected readonly playerWidth = computed(
    () => 60 / Math.max(1, this.players().length),
  );
}

/**
 * Bonus position per player for each active chain, mirroring how
 * `computeBonuses` pays out: a player's rank is 1 + the number of
 * players holding strictly more shares, so tied players share a
 * medal and push the next holder down. Classic pays two positions,
 * Tycoon three. Players without shares never rank.
 */
export function stockMedals(
  players: readonly PlayerSummary[],
  chains: readonly ChainSummary[],
  mode: GameMode,
): Partial<Record<ChainId, Record<string, Medal>>> {
  const positions = mode === 'tycoon' ? 3 : 2;
  const result: Partial<Record<ChainId, Record<string, Medal>>> =
    {};
  for (const { active, chain } of chains) {
    if (!active) continue;
    const counts = players.map((p) => p.stock?.[chain] ?? 0);
    const medals: Record<string, Medal> = {};
    players.forEach((player, i) => {
      const count = counts[i];
      if (count <= 0) return;
      const rank = 1 + counts.filter((c) => c > count).length;
      if (rank <= positions) medals[player.id] = rank as Medal;
    });
    result[chain] = medals;
  }
  return result;
}
