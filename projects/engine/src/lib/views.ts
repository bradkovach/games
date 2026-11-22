import type {
  GameEvent,
  GameResults,
  GameSettings,
  Phase,
} from './schemas';
import type { TileId } from './tiles';

import { type ChainId, CHAINS, SAFE_SIZE } from './constants';
import { sharePrice } from './pricing';
import {
  canDeclareEnd,
  tileStatus,
  type TileStatus,
} from './rules';
import {
  type ChainCounts,
  chainSizes,
  type GameState,
  remainingTiles,
} from './state';

export interface ChainSummary {
  active: boolean;
  bank: number;
  chain: ChainId;
  price: number;
  safe: boolean;
  size: number;
}

export interface PlayerSummary {
  /** Omitted for other players when holdings are secret. */
  cash?: number;
  handCount: number;
  id: string;
  name: string;
  stock?: ChainCounts;
}

export interface PlayerView extends PublicView {
  me: {
    cash: number;
    hand: { status: TileStatus; tile: TileId }[];
    id: string;
    stock: ChainCounts;
  };
}

/** Everything anyone at the table (or a spectator) may see. */
export interface PublicView {
  bagCount: number;
  board: Partial<Record<TileId, ChainId | null>>;
  canDeclareEnd: boolean;
  chains: ChainSummary[];
  discarded: TileId[];
  endDeclared: boolean;
  phase: Phase;
  players: PlayerSummary[];
  results?: GameResults;
  settings: GameSettings;
}

export function playerView(
  state: GameState,
  playerId: string,
): PlayerView {
  const view = publicView(state);
  return {
    ...view,
    me: {
      id: playerId,
      cash: state.cash[playerId] ?? 0,
      hand: (state.hands[playerId] ?? []).map((tile) => ({
        status: tileStatus(state, tile),
        tile,
      })),
      stock: { ...state.stock[playerId] },
    },
  };
}

export function publicView(state: GameState): PublicView {
  const sizes = chainSizes(state);
  const hidden = holdingsHidden(state);
  return {
    bagCount: remainingTiles(state).length,
    board: { ...state.board },
    canDeclareEnd: canDeclareEnd(state),
    chains: CHAINS.map((chain) => ({
      active: sizes[chain] > 0,
      bank: state.bank[chain],
      chain,
      price: sharePrice(chain, sizes[chain]),
      safe: sizes[chain] >= SAFE_SIZE,
      size: sizes[chain],
    })),
    discarded: [...state.discarded],
    endDeclared: state.endDeclared,
    phase: state.phase,
    players: state.players.map(({ id, name }) => ({
      id,
      handCount: state.hands[id]?.length ?? 0,
      name,
      ...(hidden
        ? {}
        : {
            cash: state.cash[id],
            stock: { ...state.stock[id] },
          }),
    })),
    results: state.results,
    settings: state.settings,
  };
}

/**
 * Strips hidden information from an event before it is sent to
 * `viewerId` (`null` for spectators). Only tile draws are private;
 * transactions happen in the open even when holdings are secret,
 * because secrecy covers running totals, not individual trades.
 */
export function redactEvent(
  event: GameEvent,
  viewerId: null | string,
): GameEvent {
  return event.type === 'tileDrawn' &&
    event.playerId !== viewerId
    ? { type: event.type, playerId: event.playerId }
    : event;
}

function holdingsHidden(state: GameState): boolean {
  return (
    state.settings.secretHoldings &&
    state.phase.kind !== 'gameOver'
  );
}
