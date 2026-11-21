import type {
  GameEvent,
  GameResults,
  GameSettings,
  Phase,
  PlayerInfo,
} from './schemas';

import {
  type ChainId,
  CHAINS,
  SHARES_PER_CHAIN,
  STARTING_CASH,
} from './constants';
import { ALL_TILES, type TileId } from './tiles';

export type ChainCounts = Record<ChainId, number>;

export interface GameState {
  bank: ChainCounts;
  /** Placed tiles; `null` marks an unincorporated tile. */
  board: Partial<Record<TileId, ChainId | null>>;
  cash: Record<string, number>;
  discarded: TileId[];
  endDeclared: boolean;
  hands: Record<string, TileId[]>;
  phase: Phase;
  /** Players in turn order. */
  players: PlayerInfo[];
  results?: GameResults;
  settings: GameSettings;
  stock: Record<string, ChainCounts>;
}

export function activeChains(state: GameState): ChainId[] {
  const sizes = chainSizes(state);
  return CHAINS.filter((chain) => sizes[chain] > 0);
}

/** Pure reducer. Events are trusted; legality lives in `decide`. */
export function apply(
  state: GameState,
  event: GameEvent,
): GameState {
  const next = structuredClone(state);
  switch (event.type) {
    case 'bonusesPaid':
      addPayouts(next.cash, event.payouts);
      break;
    case 'chainAcquired':
      for (const [tile, chain] of Object.entries(next.board)) {
        if (chain === event.chain)
          next.board[tile] = event.survivor;
      }
      break;
    case 'chainFounded':
      for (const tile of event.tiles)
        next.board[tile] = event.chain;
      if (event.founderShare) {
        next.bank[event.chain]--;
        next.stock[event.playerId][event.chain]++;
      }
      next.cash[event.playerId] += event.founderCash;
      break;
    case 'chainGrown':
      for (const tile of event.tiles)
        next.board[tile] = event.chain;
      break;
    case 'endDeclared':
      next.endDeclared = true;
      break;
    case 'gameEnded':
      next.results = event.results;
      next.cash = { ...event.results.finalCash };
      break;
    case 'gameStarted':
      next.settings = event.settings;
      next.players = event.players;
      for (const { id } of event.players) {
        next.cash[id] = STARTING_CASH;
        next.stock[id] = emptyCounts();
        next.hands[id] = [];
      }
      break;
    case 'mergeCompleted':
      for (const tile of event.tiles) {
        next.board[tile] = event.survivor;
      }
      break;
    case 'mergeStarted':
    case 'placementPassed':
      break;
    case 'phaseSet':
      next.phase = event.phase;
      break;
    case 'startTileDrawn':
      next.board[event.tile] = null;
      break;
    case 'stockDisposed': {
      const sell = event.sell ?? 0;
      const trade = event.trade ?? 0;
      const holdings = next.stock[event.playerId];
      holdings[event.chain] -= sell + trade;
      next.bank[event.chain] += sell + trade;
      holdings[event.survivor] += trade / 2;
      next.bank[event.survivor] -= trade / 2;
      next.cash[event.playerId] += event.cash ?? 0;
      break;
    }
    case 'stockPurchased':
      for (const [chain, count] of Object.entries(
        event.purchases ?? {},
      ) as [ChainId, number][]) {
        next.bank[chain] -= count;
        next.stock[event.playerId][chain] += count;
      }
      next.cash[event.playerId] -= event.cost ?? 0;
      break;
    case 'tileDrawn':
      if (event.tile)
        next.hands[event.playerId].push(event.tile);
      break;
    case 'tilePlaced':
      next.hands[event.playerId] = next.hands[
        event.playerId
      ].filter((tile) => tile !== event.tile);
      next.board[event.tile] = null;
      break;
    case 'tilesDiscarded':
      next.hands[event.playerId] = next.hands[
        event.playerId
      ].filter((tile) => !event.tiles.includes(tile));
      next.discarded.push(...event.tiles);
      break;
    case 'turnOrderSet': {
      const byId = new Map(next.players.map((p) => [p.id, p]));
      next.players = event.order.map((id) => byId.get(id)!);
      break;
    }
  }
  return next;
}

export function chainSize(
  state: GameState,
  chain: ChainId,
): number {
  let size = 0;
  for (const value of Object.values(state.board)) {
    if (value === chain) size++;
  }
  return size;
}

export function chainSizes(state: GameState): ChainCounts {
  const sizes = emptyCounts();
  for (const value of Object.values(state.board)) {
    if (value) sizes[value]++;
  }
  return sizes;
}

export function emptyCounts(value = 0): ChainCounts {
  return Object.fromEntries(
    CHAINS.map((chain) => [chain, value]),
  ) as ChainCounts;
}

export function initialState(): GameState {
  return {
    bank: emptyCounts(SHARES_PER_CHAIN),
    board: {},
    cash: {},
    discarded: [],
    endDeclared: false,
    hands: {},
    phase: { kind: 'notStarted' },
    players: [],
    settings: { mode: 'classic', secretHoldings: false },
    stock: {},
  };
}

/** Tiles still in the draw pile (order is never stored). */
export function remainingTiles(state: GameState): TileId[] {
  const used = new Set<TileId>([
    ...Object.keys(state.board),
    ...state.discarded,
    ...Object.values(state.hands).flat(),
  ]);
  return ALL_TILES.filter((tile) => !used.has(tile));
}

export function replay(events: readonly GameEvent[]): GameState {
  return events.reduce(apply, initialState());
}

function addPayouts(
  cash: Record<string, number>,
  payouts: Record<string, number>,
): void {
  for (const [player, amount] of Object.entries(payouts)) {
    cash[player] = (cash[player] ?? 0) + amount;
  }
}
