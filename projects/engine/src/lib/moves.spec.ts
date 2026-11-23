import type { ChainId } from './constants';
import type { Phase } from './schemas';

import { legalMoves } from './moves';
import { apply, type GameState, initialState } from './state';
import { playerView } from './views';

function line(
  chain: ChainId,
  row: string,
  from: number,
  to: number,
) {
  const board: Record<string, ChainId> = {};
  for (let col = from; col <= to; col++)
    board[`${col}${row}`] = chain;
  return board;
}

function makeState(
  options: Partial<Pick<GameState, 'board' | 'endDeclared'>> & {
    bank?: Partial<Record<ChainId, number>>;
    cash?: number;
    hand?: string[];
    phase?: Phase;
    stock?: Partial<Record<ChainId, number>>;
  },
): GameState {
  const state = apply(initialState(), {
    type: 'gameStarted',
    players: [
      { id: 'a', name: 'a' },
      { id: 'b', name: 'b' },
    ],
    settings: { mode: 'classic', secretHoldings: true },
  });
  return {
    ...state,
    bank: { ...state.bank, ...options.bank },
    board: options.board ?? {},
    cash: { ...state.cash, a: options.cash ?? 6000 },
    endDeclared: options.endDeclared ?? false,
    hands: { a: options.hand ?? [], b: ['12I'] },
    phase: options.phase ?? { kind: 'placeTile', playerId: 'a' },
    stock: {
      ...state.stock,
      a: { ...state.stock['a'], ...options.stock },
    },
  };
}

const movesFor = (state: GameState, id = 'a') =>
  legalMoves(playerView(state, id));

describe('legalMoves', () => {
  it('lists playable tiles with their effect', () => {
    const state = makeState({
      board: {
        ...line('tower', 'A', 1, 2),
        ...line('sackson', 'A', 4, 5),
        '1C': null,
      },
      hand: ['3A', '6A', '1D', '9I'],
    });
    expect(movesFor(state)).toMatchObject({
      declareEnd: false,
      myTurn: true,
      pass: false,
      place: [
        {
          chains: ['sackson', 'tower'],
          effect: 'merge',
          tile: '3A',
        },
        { chains: ['sackson'], effect: 'grow', tile: '6A' },
        { chains: [], effect: 'found', tile: '1D' },
        { chains: [], effect: 'independent', tile: '9I' },
      ],
    });
  });

  it('excludes dead tiles and allows passing', () => {
    const state = makeState({
      board: {
        ...line('tower', 'A', 1, 11),
        ...line('sackson', 'C', 1, 11),
      },
      hand: ['1B'],
    });
    expect(movesFor(state)).toMatchObject({
      pass: true,
      place: [],
    });
  });

  it('is empty when waiting on another player', () => {
    const state = makeState({ hand: ['1A'] });
    expect(movesFor(state, 'b')).toEqual({
      declareEnd: false,
      myTurn: false,
      phase: 'placeTile',
    });
  });

  it('caps purchases by cash, bank and the 3-share limit', () => {
    const state = makeState({
      bank: { tower: 1 },
      board: {
        ...line('tower', 'A', 1, 2),
        ...line('imperial', 'C', 1, 2),
        ...line('american', 'E', 1, 2),
      },
      cash: 900,
      phase: { kind: 'buyStock', playerId: 'a' },
    });
    expect(movesFor(state).buy).toEqual({
      anyActive: true,
      cash: 900,
      chains: [
        { bank: 1, chain: 'tower', max: 1, price: 200 },
        { bank: 25, chain: 'american', max: 3, price: 300 },
        { bank: 25, chain: 'imperial', max: 2, price: 400 },
      ],
      max: 3,
    });
  });

  it('offers nothing to buy when every share is too dear', () => {
    const state = makeState({
      board: line('imperial', 'C', 1, 2),
      cash: 100,
      phase: { kind: 'buyStock', playerId: 'a' },
    });
    expect(movesFor(state).buy).toEqual({
      anyActive: true,
      cash: 100,
      chains: [],
      max: 0,
    });
  });

  it('limits even trades by the survivor bank', () => {
    const state = makeState({
      bank: { sackson: 2 },
      board: {
        ...line('tower', 'A', 1, 3),
        ...line('sackson', 'A', 5, 9),
        '4A': null,
      },
      phase: {
        acquired: 'tower',
        kind: 'disposeStock',
        mergemaker: 'a',
        playerId: 'a',
        queue: [],
        remaining: [],
        survivor: 'sackson',
        tile: '4A',
      },
      stock: { tower: 7 },
    });
    expect(movesFor(state).dispose).toEqual({
      acquired: 'tower',
      owned: 7,
      price: 300,
      survivor: 'sackson',
      tradeMax: 4,
    });
  });

  it('lists chain choices for founding and mergers', () => {
    const board = {
      ...line('tower', 'A', 1, 2),
      ...line('sackson', 'C', 1, 2),
    };
    expect(
      movesFor(
        makeState({
          board,
          phase: {
            kind: 'foundChain',
            playerId: 'a',
            tile: '5E',
          },
        }),
      ).found,
    ).toEqual([
      'american',
      'festival',
      'worldwide',
      'continental',
      'imperial',
    ]);
    expect(
      movesFor(
        makeState({
          board,
          phase: {
            candidates: ['tower', 'sackson'],
            kind: 'chooseSurvivor',
            playerId: 'a',
            tile: '1B',
          },
        }),
      ).pickSurvivor,
    ).toEqual(['tower', 'sackson']);
  });

  it('allows declaring the end once a chain is safe', () => {
    const state = makeState({
      board: line('tower', 'A', 1, 11),
      phase: { kind: 'buyStock', playerId: 'a' },
    });
    expect(movesFor(state).declareEnd).toBe(true);
    expect(
      movesFor({ ...state, endDeclared: true }).declareEnd,
    ).toBe(false);
  });
});
