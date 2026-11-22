import type { TileId, TileStatus } from 'engine';

export const TILE_HINTS: Record<TileStatus, string> = {
  dead: 'Dead: would merge two safe chains. Tick “discard dead tiles” when ending your turn to swap it for a new one.',
  playable: 'Playable',
  unplayable:
    'Unplayable for now: it would found a new chain, but all 7 chains are on the board. Keep it until a merger frees a chain.',
};

export function tileHints(
  hand: readonly { status: TileStatus; tile: TileId }[],
): Partial<Record<TileId, string>> {
  return Object.fromEntries(
    hand
      .filter((t) => t.status !== 'playable')
      .map((t) => [t.tile, TILE_HINTS[t.status]]),
  );
}
