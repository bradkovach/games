import {
  CHAIN_TIER,
  type ChainId,
  type GameMode,
} from './constants';

const TIER_OFFSET = { cheap: 0, expensive: 2, mid: 1 } as const;

/** Lower bound of each price bracket for a cheap-tier chain. */
const BRACKETS = [2, 3, 4, 5, 6, 11, 21, 31, 41] as const;

const TYCOON_SECONDARY = [
  1500, 2200, 3000, 3700, 4200, 5000, 5700, 6200, 7000, 7700,
  8200,
];
const TYCOON_TERTIARY = [
  1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000, 5500,
  6000,
];

export interface BonusTable {
  price: number;
  primary: number;
  secondary: number;
  tertiary?: number;
}

export function bonusTable(
  chain: ChainId,
  size: number,
  mode: GameMode,
): BonusTable {
  const price = sharePrice(chain, size);
  if (price === 0) return { price, primary: 0, secondary: 0 };
  if (mode === 'classic') {
    return { price, primary: price * 10, secondary: price * 5 };
  }
  const row = price / 100 - 2;
  return {
    price,
    primary: price * 10,
    secondary: TYCOON_SECONDARY[row],
    tertiary: TYCOON_TERTIARY[row],
  };
}

/**
 * Pays stockholder bonuses for one chain. Tied players pool the
 * bonuses for the positions they occupy and split them evenly,
 * each share rounded up to the nearest $100.
 */
export function computeBonuses(
  holdings: Readonly<Record<string, number>>,
  chain: ChainId,
  size: number,
  mode: GameMode,
): Record<string, number> {
  const table = bonusTable(chain, size, mode);
  const holders = Object.entries(holdings)
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a);
  const payouts: Record<string, number> = {};
  if (holders.length === 0 || table.price === 0) return payouts;

  if (holders.length === 1) {
    const extra =
      mode === 'tycoon'
        ? (table.tertiary ?? 0)
        : table.secondary;
    payouts[holders[0][0]] = table.primary + extra;
    return payouts;
  }

  const positions = [table.primary, table.secondary];
  if (mode === 'tycoon' && holders.length > 2) {
    positions.push(table.tertiary ?? 0);
  }

  let position = 0;
  let i = 0;
  while (i < holders.length && position < positions.length) {
    const count = holders[i][1];
    const group = holders.filter(([, c]) => c === count);
    const pool = positions
      .slice(position, position + group.length)
      .reduce((sum, value) => sum + value, 0);
    const each = roundUpToHundred(pool / group.length);
    for (const [player] of group) payouts[player] = each;
    position += group.length;
    i += group.length;
  }
  return payouts;
}

export function roundUpToHundred(amount: number): number {
  return Math.ceil(amount / 100) * 100;
}

/** Share price of a chain with `size` tiles; 0 when inactive. */
export function sharePrice(
  chain: ChainId,
  size: number,
): number {
  if (size < 2) return 0;
  const step =
    bracketIndex(size) + TIER_OFFSET[CHAIN_TIER[chain]];
  return 200 + step * 100;
}

function bracketIndex(size: number): number {
  let index = -1;
  for (const [i, min] of BRACKETS.entries()) {
    if (size >= min) index = i;
  }
  return index;
}
