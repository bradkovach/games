import {
  type ChainId,
  CHAINS,
  END_SIZE,
  SAFE_SIZE,
} from './constants';
import {
  activeChains,
  chainSize,
  chainSizes,
  type GameState,
  remainingTiles,
} from './state';
import { neighbors, type TileId } from './tiles';

export type Placement =
  | { chain: ChainId; group: TileId[]; kind: 'grow' }
  | { chains: ChainId[]; kind: 'merge' }
  | { group: TileId[]; kind: 'found' }
  | { kind: 'dead' }
  | { kind: 'independent' }
  | { kind: 'unplayable' };

export type TileStatus = 'dead' | 'playable' | 'unplayable';

export function adjacentChains(
  state: GameState,
  tile: TileId,
): ChainId[] {
  const chains = new Set<ChainId>();
  for (const next of neighbors(tile)) {
    const chain = state.board[next];
    if (chain) chains.add(chain);
  }
  return CHAINS.filter((chain) => chains.has(chain));
}

export function availableChains(state: GameState): ChainId[] {
  const active = new Set(activeChains(state));
  return CHAINS.filter((chain) => !active.has(chain));
}

export function canDeclareEnd(state: GameState): boolean {
  const active = activeChains(state);
  const sizes = chainSizes(state);
  if (active.some((chain) => sizes[chain] >= END_SIZE))
    return true;
  if (
    active.length > 0 &&
    active.every((chain) => sizes[chain] >= SAFE_SIZE)
  ) {
    return true;
  }
  // Escape hatch so a game with no tiles left to play can finish.
  return (
    remainingTiles(state).length === 0 &&
    state.players.every((p) => !hasPlayableTile(state, p.id))
  );
}

export function classifyPlacement(
  state: GameState,
  tile: TileId,
): Placement {
  const chains = adjacentChains(state, tile);
  if (chains.length > 1) {
    const safe = chains.filter((chain) => isSafe(state, chain));
    return safe.length > 1
      ? { kind: 'dead' }
      : { chains, kind: 'merge' };
  }
  const group = unincorporatedGroup(state, tile);
  if (chains.length === 1) {
    return { chain: chains[0], group, kind: 'grow' };
  }
  if (group.length > 1) {
    return availableChains(state).length > 0
      ? { group, kind: 'found' }
      : { kind: 'unplayable' };
  }
  return { kind: 'independent' };
}

export function hasPlayableTile(
  state: GameState,
  playerId: string,
): boolean {
  return (state.hands[playerId] ?? []).some(
    (tile) => tileStatus(state, tile) === 'playable',
  );
}

export function isSafe(
  state: GameState,
  chain: ChainId,
): boolean {
  return chainSize(state, chain) >= SAFE_SIZE;
}

/** Seat order starting at `playerId`. */
export function seatsFrom(
  state: GameState,
  playerId: string,
): string[] {
  const ids = state.players.map((p) => p.id);
  const start = ids.indexOf(playerId);
  return [...ids.slice(start), ...ids.slice(0, start)];
}

export function tileStatus(
  state: GameState,
  tile: TileId,
): TileStatus {
  const { kind } = classifyPlacement(state, tile);
  return kind === 'dead' || kind === 'unplayable'
    ? kind
    : 'playable';
}

/**
 * Unincorporated tiles connected to `tile` (inclusive), treating
 * `tile` as placed even if it is not on the board yet.
 */
export function unincorporatedGroup(
  state: GameState,
  tile: TileId,
): TileId[] {
  const seen = new Set<TileId>([tile]);
  const stack = [tile];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const next of neighbors(current)) {
      if (!seen.has(next) && state.board[next] === null) {
        seen.add(next);
        stack.push(next);
      }
    }
  }
  return [...seen];
}
