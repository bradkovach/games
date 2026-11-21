import { COLUMNS, ROWS } from './constants';

export interface TileCoord {
  col: number;
  row: number;
}

/** Tile ids look like `1A` .. `12I` (column number + row letter). */
export type TileId = string;

export function isTileId(tile: string): boolean {
  return parseTile(tile) !== undefined;
}

export function parseTile(tile: TileId): TileCoord | undefined {
  const match = /^(\d{1,2})([A-I])$/.exec(tile);
  if (!match) return undefined;
  const col = Number(match[1]) - 1;
  const row = ROWS.indexOf(match[2]);
  if (col < 0 || col >= COLUMNS || row < 0) return undefined;
  return { col, row };
}

export function tileId(col: number, row: number): TileId {
  return `${col + 1}${ROWS[row]}`;
}

export const ALL_TILES: readonly TileId[] = Array.from(
  { length: COLUMNS * ROWS.length },
  (_, i) => tileId(i % COLUMNS, Math.floor(i / COLUMNS)),
);

/**
 * Orders tiles by distance from 1A for the turn-order draw:
 * the row letter ranks before the number, so 9A precedes 1B.
 */
export function compareTiles(a: TileId, b: TileId): number {
  const ca = parseTile(a);
  const cb = parseTile(b);
  if (!ca || !cb) return 0;
  return ca.row - cb.row || ca.col - cb.col;
}

export function neighbors(tile: TileId): TileId[] {
  const coord = parseTile(tile);
  if (!coord) return [];
  const { col, row } = coord;
  const result: TileId[] = [];
  if (row > 0) result.push(tileId(col, row - 1));
  if (row < ROWS.length - 1) result.push(tileId(col, row + 1));
  if (col > 0) result.push(tileId(col - 1, row));
  if (col < COLUMNS - 1) result.push(tileId(col + 1, row));
  return result;
}
