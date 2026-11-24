import type { PlayerView } from 'engine';

export const STOCK = {
  american: 0,
  continental: 0,
  festival: 0,
  imperial: 0,
  sackson: 0,
  tower: 0,
  worldwide: 0,
};

/** A player view in the buy phase with one active chain. */
export function makeTestView(
  overrides: Partial<PlayerView> = {},
): PlayerView {
  return {
    bagCount: 80,
    board: {},
    canDeclareEnd: false,
    chains: [
      {
        active: true,
        bank: 20,
        chain: 'tower',
        price: 300,
        safe: false,
        size: 3,
      },
    ],
    discarded: [],
    endDeclared: false,
    me: {
      cash: 6000,
      hand: [{ status: 'playable', tile: '1A' }],
      id: 'a',
      stock: { ...STOCK },
    },
    phase: { kind: 'buyStock', playerId: 'a' },
    players: [],
    settings: { mode: 'classic', secretHoldings: false },
    ...overrides,
  };
}

/** Records the commands a component sends. */
export function stubClient() {
  const sent: unknown[] = [];
  return {
    client: { send: (command: unknown) => sent.push(command) },
    sent,
  };
}
