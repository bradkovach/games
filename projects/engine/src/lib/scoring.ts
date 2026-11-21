import type { GameResults } from './schemas';

import {
  type ChainId,
  CHAINS,
  type GameMode,
} from './constants';
import { computeBonuses, sharePrice } from './pricing';

export interface ScoreInput {
  /** Tile count per chain; chains smaller than 2 are inactive. */
  chainSizes: Partial<Record<ChainId, number>>;
  mode: GameMode;
  players: {
    cash: number;
    holdings: Partial<Record<ChainId, number>>;
    id: string;
  }[];
}

/**
 * End-of-game scoring: pay bonuses for every active chain, then
 * sell all shares at current prices. Inactive stock is worthless.
 */
export function finalScore(input: ScoreInput): GameResults {
  const bonuses: GameResults['bonuses'] = {};
  const sales: Record<string, number> = {};
  const finalCash: Record<string, number> = {};
  for (const player of input.players) {
    sales[player.id] = 0;
    finalCash[player.id] = player.cash;
  }

  for (const chain of CHAINS) {
    const size = input.chainSizes[chain] ?? 0;
    if (size < 2) continue;
    const holdings = Object.fromEntries(
      input.players.map((p) => [p.id, p.holdings[chain] ?? 0]),
    );
    const payouts = computeBonuses(
      holdings,
      chain,
      size,
      input.mode,
    );
    bonuses[chain] = payouts;
    const price = sharePrice(chain, size);
    for (const player of input.players) {
      sales[player.id] += (player.holdings[chain] ?? 0) * price;
      finalCash[player.id] += payouts[player.id] ?? 0;
    }
  }

  for (const player of input.players) {
    finalCash[player.id] += sales[player.id];
  }
  const best = Math.max(...Object.values(finalCash));
  const winners = input.players
    .filter((p) => finalCash[p.id] === best)
    .map((p) => p.id);
  return { bonuses, finalCash, sales, winners };
}

/** Standings sorted by final cash; tied players share a place. */
export function rankPlayers(
  finalCash: Record<string, number>,
): { cash: number; id: string; place: number }[] {
  const sorted = Object.entries(finalCash)
    .map(([id, cash]) => ({ cash, id }))
    .sort((a, b) => b.cash - a.cash);
  return sorted.map((entry) => ({
    ...entry,
    place: sorted.findIndex((e) => e.cash === entry.cash) + 1,
  }));
}
