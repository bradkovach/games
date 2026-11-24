import type { SeatGrant } from '../../shared/protocol';

const key = (gameId: string) => `acquire.seat.${gameId}`;

export function clearSeat(gameId: string): void {
  localStorage.removeItem(key(gameId));
}

export function loadSeat(gameId: string): null | SeatGrant {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(key(gameId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SeatGrant;
  } catch {
    return null;
  }
}

/** Seat tokens are the reconnect credential for a player. */
export function saveSeat(grant: SeatGrant): void {
  localStorage.setItem(key(grant.gameId), JSON.stringify(grant));
}
