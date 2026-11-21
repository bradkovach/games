import {
  type ChainId,
  CHAINS,
  finalScore,
  type GameMode,
  type GameResults,
  SHARES_PER_CHAIN,
} from 'engine';

export interface ScoreboardPlayer {
  cash: number;
  holdings: Partial<Record<ChainId, number>>;
  id: string;
  name: string;
}

export interface ScoreboardState {
  chainSizes: Partial<Record<ChainId, number>>;
  mode: GameMode;
  players: ScoreboardPlayer[];
}

export const STORAGE_KEY = 'acquire.scoreboard';

export function emptyScoreboard(): ScoreboardState {
  return {
    chainSizes: {},
    mode: 'classic',
    players: [newPlayer(1), newPlayer(2), newPlayer(3)],
  };
}

export function newPlayer(n: number): ScoreboardPlayer {
  return {
    cash: 0,
    holdings: {},
    id: `p${Date.now().toString(36)}${n}`,
    name: `Player ${n}`,
  };
}

export function parseScoreboard(
  raw: null | string,
): ScoreboardState {
  if (!raw) return emptyScoreboard();
  try {
    const value = JSON.parse(raw) as ScoreboardState;
    if (!Array.isArray(value.players)) return emptyScoreboard();
    return {
      chainSizes: value.chainSizes ?? {},
      mode: value.mode === 'tycoon' ? 'tycoon' : 'classic',
      players: value.players,
    };
  } catch {
    return emptyScoreboard();
  }
}

export function score(
  state: ScoreboardState,
): GameResults | null {
  if (state.players.length === 0) return null;
  return finalScore({
    chainSizes: state.chainSizes,
    mode: state.mode,
    players: state.players,
  });
}

/** Sanity checks that usually mean a typo when copying the table. */
export function warnings(state: ScoreboardState): string[] {
  const out: string[] = [];
  for (const chain of CHAINS) {
    const total = state.players.reduce(
      (sum, p) => sum + (p.holdings[chain] ?? 0),
      0,
    );
    const size = state.chainSizes[chain] ?? 0;
    if (total > SHARES_PER_CHAIN) {
      out.push(
        `${chain}: ${total} shares held, but only ${SHARES_PER_CHAIN} exist.`,
      );
    }
    if (total > 0 && size < 2) {
      out.push(
        `${chain}: shares are held but the chain is not on the board (worth $0).`,
      );
    }
    if (size === 1 || size > 108) {
      out.push(`${chain}: size ${size} is not possible.`);
    }
  }
  return out;
}
