import type { PlayerView } from 'engine';

import { renderSnapshot } from './render';

const STOCK = {
  american: 0,
  continental: 0,
  festival: 0,
  imperial: 0,
  sackson: 0,
  tower: 0,
  worldwide: 0,
};

const chain = (
  id: PlayerView['chains'][number]['chain'],
  size: number,
) => ({
  active: size > 0,
  bank: 20,
  chain: id,
  price: size * 100,
  safe: false,
  size,
});

describe('renderSnapshot', () => {
  it('marks merger chains and whose decision it is', () => {
    const view: PlayerView = {
      bagCount: 50,
      board: {},
      canDeclareEnd: false,
      chains: [
        chain('tower', 4),
        chain('sackson', 6),
        chain('festival', 3),
      ],
      discarded: [],
      endDeclared: false,
      me: { cash: 6000, hand: [], id: 'a', stock: { ...STOCK } },
      phase: {
        acquired: 'tower',
        kind: 'disposeStock',
        mergemaker: 'b',
        playerId: 'c',
        queue: [],
        remaining: ['festival'],
        survivor: 'sackson',
        tile: '5E',
      },
      players: [],
      settings: { mode: 'classic', secretHoldings: true },
    };
    const text = renderSnapshot({
      chat: [],
      events: [],
      lobby: {
        hostPlayerId: 'a',
        id: 'g',
        players: [
          { avatar: '⛵', id: 'a', name: 'Alice' },
          { avatar: '⚓', id: 'b', name: 'Bob' },
          { avatar: '☄', id: 'c', name: 'Carol' },
        ],
        settings: { mode: 'classic', secretHoldings: true },
        started: true,
      },
      moves: null,
      playerId: 'a',
      view,
    });
    expect(text).toContain(
      "# Not your turn. Waiting for ☄ Carol: sell, trade or keep Tower stock (Tower is being acquired by Sackson in ⚓ Bob's merger)",
    );
    expect(text).toContain(
      '| tower | 4 | $400 | 20 | being acquired by Sackson |',
    );
    expect(text).toContain('acquired next by Sackson');
    expect(text).toContain(
      'Merger in progress: Tower stays listed',
    );
  });
});
