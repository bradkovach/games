import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import {
  CHAIN_NAMES,
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

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TickerComponent],
  selector: 'app-players-panel',
  styles: `
    thead th {
      text-align: center;
    }
    th.player {
      vertical-align: bottom;
      width: var(--player-width);
    }
    th.player.you .name {
      text-decoration: underline;
    }
    .avatar {
      display: block;
      font-size: 1.4rem;
      line-height: 1.2;
      margin-bottom: 0.2rem;
    }
    .name {
      display: block;
      /* font-size: 0.8rem; */
      font-weight: 700;
      margin-inline: auto;
      max-width: 6rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      text-align: center;
    }
    .marker {
      color: var(--accent);
      font-size: 0.75rem;
    }
    tr.inactive td {
      color: var(--muted);
    }
    td.num {
      text-align: center;
    }
    td.medal-1 {
      --metal: var(--gold);
    }
    td.medal-2 {
      --metal: var(--silver);
    }
    td.medal-3 {
      --metal: var(--bronze);
    }
    /* A brief, staggered glint on the text only; not a call to act. */
    td.medal {
      animation: medal-glint 4s ease-in-out infinite;
      animation-delay: var(--shine-delay, 0s);
      font-weight: 700;
    }
    @keyframes medal-glint {
      0%,
      16%,
      100% {
        color: var(--ink);
      }
      8% {
        color: var(--metal);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      td.medal {
        animation: none;
        color: var(--metal);
      }
    }
  `,
  template: `
    <table [style.--player-width.%]="playerWidth()">
      <thead>
        <tr>
          @if (!secret()) {
            <th><span class="visually-hidden">Asset</span></th>
          }
          @for (player of players(); track player.id) {
            <th
              scope="col"
              class="player"
              [class.turn]="player.id === active()"
              [class.you]="player.id === you()"
              [title]="player.name"
            >
              @if (player.id === active()) {
                <span class="marker">
                  ▶<span class="visually-hidden"
                    >Current turn:</span
                  >
                </span>
              }
              @if (avatars().get(player.id); as avatar) {
                <span class="avatar emoji" aria-hidden="true">{{
                  avatar
                }}</span>
              }
              <span class="name">{{ player.name }}</span>
            </th>
          }
        </tr>
      </thead>
      @if (secret()) {
        <tbody>
          <tr>
            <td
              class="muted text-center py-3"
              [attr.colspan]="players().length + 1"
            >
              Holdings are secret until the game ends.
            </td>
          </tr>
        </tbody>
      } @else {
        <tbody>
          <tr>
            <th scope="row">Cash</th>
            @for (player of players(); track player.id) {
              <td class="figure">
                <app-ticker
                  format="currency"
                  [value]="player.cash ?? 0"
                />
              </td>
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
                [title]="names[c.chain]"
              >
                {{ names[c.chain] }}
              </th>
              @for (
                player of players();
                track player.id;
                let col = $index
              ) {
                @let medal = medals()[c.chain]?.[player.id];
                <td
                  class="num"
                  [class]="medal ? 'medal medal-' + medal : ''"
                  [style.--shine-delay]="
                    medal ? (row + col) * 0.25 + 's' : null
                  "
                  [attr.title]="medal ? medalNames[medal] : null"
                >
                  <app-ticker
                    [value]="player.stock?.[c.chain] ?? 0"
                  />
                </td>
              }
            </tr>
          }
        </tbody>
      }
    </table>
  `,
})
export class PlayersPanelComponent {
  readonly active = input<null | string>(null);
  readonly avatars = input<ReadonlyMap<string, string>>(
    new Map(),
  );
  readonly chains = input<readonly ChainSummary[]>([]);
  readonly gameMode = input.required<GameMode>();
  readonly lockIcon = '\u{1F512}\u{FE0E}';
  readonly players = input.required<PlayerSummary[]>();
  readonly you = input<null | string>(null);
  /** Every chain in board order, even before it is founded. */
  protected readonly chainRows = computed(() =>
    CHAINS.map(
      (chain) =>
        this.chains().find((c) => c.chain === chain) ?? {
          active: false,
          chain,
        },
    ),
  );
  protected readonly medalNames = MEDAL_NAMES;
  protected readonly medals = computed(() =>
    stockMedals(this.players(), this.chains(), this.gameMode()),
  );
  protected readonly names = CHAIN_NAMES;
  /** Splits the space left by the shrink-wrapped chain column. */
  protected readonly playerWidth = computed(
    () => 100 / Math.max(1, this.players().length),
  );
  /** Public views omit every player's holdings in secret mode. */
  protected readonly secret = computed(() =>
    this.players().every(
      (p) => p.cash === undefined && p.stock === undefined,
    ),
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
