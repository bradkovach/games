import type { ChainId } from './constants';
import type { CommandInput, GameEvent, Phase } from './schemas';

import { decide, startGame } from './decide';
import { Game } from './engine';
import {
  apply,
  chainSize,
  type GameState,
  initialState,
  remainingTiles,
  replay,
} from './state';
import { playerView, publicView, redactEvent } from './views';

function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PLAYERS = ['a', 'b', 'c'].map((id) => ({ id, name: id }));

function attempt(
  state: GameState,
  playerId: string,
  command: CommandInput,
) {
  return decide(state, playerId, command, seeded(1));
}

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

function makeState(options: {
  board?: Record<string, ChainId | null>;
  hands?: Record<string, string[]>;
  phase?: Phase;
  secret?: boolean;
}): GameState {
  const state = apply(initialState(), {
    players: PLAYERS,
    settings: {
      mode: 'classic',
      secretHoldings: options.secret ?? false,
    },
    type: 'gameStarted',
  });
  return {
    ...state,
    board: options.board ?? {},
    hands: { a: [], b: [], c: [], ...options.hands },
    phase: options.phase ?? { kind: 'placeTile', playerId: 'a' },
  };
}

function run(
  state: GameState,
  playerId: string,
  command: CommandInput,
): GameState {
  const result = attempt(state, playerId, command);
  if (!result.ok) throw new Error(result.error);
  return result.events.reduce(apply, state);
}

describe('startGame', () => {
  it('places setup tiles, orders turns and deals hands', () => {
    const events = startGame(
      { mode: 'classic', secretHoldings: false },
      PLAYERS,
      seeded(42),
    );
    const state = replay(events);
    expect(Object.keys(state.board)).toHaveLength(3);
    for (const { id } of PLAYERS) {
      expect(state.hands[id]).toHaveLength(6);
      expect(state.cash[id]).toBe(6000);
    }
    expect(remainingTiles(state)).toHaveLength(108 - 3 - 18);
    expect(state.phase).toEqual({
      kind: 'placeTile',
      playerId: state.players[0].id,
    });
  });

  it('is reproducible from the event log', () => {
    const game = new Game([], seeded(7));
    game.start(
      { mode: 'tycoon', secretHoldings: true },
      PLAYERS,
    );
    const first = game.state.phase;
    if (first.kind !== 'placeTile') throw new Error('bad phase');
    const hand = game.playerView(first.playerId).me.hand;
    const tile = hand.find((t) => t.status === 'playable')!.tile;
    game.dispatch(first.playerId, { tile, type: 'placeTile' });
    expect(new Game(game.events).state).toEqual(game.state);
  });
});

describe('placing tiles', () => {
  it('rejects bad tiles and out-of-turn play', () => {
    const state = makeState({ hands: { a: ['1A'], b: ['2A'] } });
    expect(
      attempt(state, 'a', { tile: '3C', type: 'placeTile' }),
    ).toEqual({
      error: 'That tile is not in your hand',
      ok: false,
    });
    expect(
      attempt(state, 'b', { tile: '2A', type: 'placeTile' }),
    ).toEqual({ error: 'It is not your turn', ok: false });
    expect(
      attempt(state, 'a', { tile: 'ZZ', type: 'placeTile' }),
    ).toEqual({ error: 'Invalid tile id', ok: false });
  });

  it('founds a chain and awards the founder share', () => {
    let state = makeState({
      board: { '1A': null, '1B': null },
      hands: { a: ['2A'] },
    });
    state = run(state, 'a', { tile: '2A', type: 'placeTile' });
    expect(state.phase.kind).toBe('foundChain');
    state = run(state, 'a', {
      chain: 'tower',
      type: 'foundChain',
    });
    expect(chainSize(state, 'tower')).toBe(3);
    expect(state.stock['a'].tower).toBe(1);
    expect(state.bank.tower).toBe(24);
    expect(state.phase).toEqual({
      kind: 'buyStock',
      playerId: 'a',
    });
  });

  it('grows a chain and absorbs connected independents', () => {
    let state = makeState({
      board: {
        '1A': 'tower',
        '2A': 'tower',
        '4A': null,
        '4B': null,
      },
      hands: { a: ['3A'] },
    });
    state = run(state, 'a', { tile: '3A', type: 'placeTile' });
    expect(chainSize(state, 'tower')).toBe(5);
  });

  it('blocks an 8th chain and safe-safe merges', () => {
    const board: Record<string, ChainId | null> = {
      ...line('sackson', 'A', 1, 11),
      ...line('tower', 'C', 1, 11),
      ...line('american', 'E', 1, 2),
      ...line('festival', 'E', 4, 5),
      ...line('worldwide', 'E', 7, 8),
      ...line('continental', 'G', 1, 2),
      ...line('imperial', 'G', 4, 5),
      '12I': null,
    };
    const state = makeState({
      board,
      hands: { a: ['5B', '11I'] },
    });
    expect(playerView(state, 'a').me.hand).toEqual([
      { status: 'dead', tile: '5B' },
      { status: 'unplayable', tile: '11I' },
    ]);
    expect(
      attempt(state, 'a', { tile: '5B', type: 'placeTile' }).ok,
    ).toBe(false);
    expect(
      attempt(state, 'a', { type: 'passPlacement' }).ok,
    ).toBe(true);
  });

  it('discards dead tiles at the end of the turn', () => {
    const board = {
      ...line('sackson', 'A', 1, 11),
      ...line('tower', 'C', 1, 11),
    };
    let state = makeState({
      board,
      hands: { a: ['5B'] },
      phase: { kind: 'buyStock', playerId: 'a' },
    });
    state = run(state, 'a', { type: 'endTurn' });
    expect(state.discarded).toEqual(['5B']);
    expect(state.hands['a']).toHaveLength(2);
  });
});

describe('mergers', () => {
  // tower: 1A-3A (3), sackson: 5A-6A (2); 4A merges them.
  const board = {
    ...line('tower', 'A', 1, 3),
    ...line('sackson', 'A', 5, 6),
    '4B': null,
  };

  it('pays bonuses, lets holders sell/trade, and merges', () => {
    let state = makeState({ board, hands: { b: ['4A'] } });
    state = {
      ...state,
      phase: { kind: 'placeTile', playerId: 'b' },
      stock: {
        a: { ...state.stock['a'], sackson: 4 },
        b: { ...state.stock['b'], sackson: 1 },
        c: { ...state.stock['c'], sackson: 4 },
      },
    };
    state = run(state, 'b', { tile: '4A', type: 'placeTile' });
    // Sackson at 2 tiles is $200; tied first pools 2000 + 1000.
    expect(state.cash).toEqual({ a: 7500, b: 6000, c: 7500 });
    expect(state.phase).toMatchObject({
      kind: 'disposeStock',
      playerId: 'b',
      queue: ['c', 'a'],
    });
    state = run(state, 'b', {
      sell: 1,
      trade: 0,
      type: 'disposeStock',
    });
    expect(
      attempt(state, 'c', {
        sell: 0,
        trade: 3,
        type: 'disposeStock',
      }).ok,
    ).toBe(false);
    state = run(state, 'c', {
      sell: 0,
      trade: 4,
      type: 'disposeStock',
    });
    state = run(state, 'a', {
      sell: 0,
      trade: 0,
      type: 'disposeStock',
    });
    expect(state.cash['b']).toBe(6200);
    expect(state.stock['c']).toMatchObject({
      sackson: 0,
      tower: 2,
    });
    expect(state.stock['a'].sackson).toBe(4);
    expect(chainSize(state, 'tower')).toBe(7);
    expect(chainSize(state, 'sackson')).toBe(0);
    expect(state.phase).toEqual({
      kind: 'buyStock',
      playerId: 'b',
    });
  });

  it('lets the mergemaker choose between equal chains', () => {
    // tower: 2A-3A (2), sackson: 5A-6A (2); a tie at 4A.
    let state = makeState({
      board: {
        ...line('tower', 'A', 2, 3),
        ...line('sackson', 'A', 5, 6),
        '4B': null,
      },
      hands: { a: ['4A'] },
    });
    state = run(state, 'a', { tile: '4A', type: 'placeTile' });
    expect(state.phase).toMatchObject({
      candidates: ['sackson', 'tower'],
      kind: 'chooseSurvivor',
    });
    state = run(state, 'a', {
      chain: 'sackson',
      type: 'chooseSurvivor',
    });
    expect(chainSize(state, 'sackson')).toBe(6);
    expect(chainSize(state, 'tower')).toBe(0);
  });
});

describe('buying and ending', () => {
  it('enforces purchase limits and cash', () => {
    const state = makeState({
      board: line('tower', 'A', 1, 2),
      phase: { kind: 'buyStock', playerId: 'a' },
    });
    const buy = (purchases: Record<string, number>) =>
      attempt(state, 'a', { purchases, type: 'endTurn' });
    expect(buy({ tower: 4 }).ok).toBe(false);
    expect(buy({ sackson: 1 }).ok).toBe(false);
    const next = run(state, 'a', {
      purchases: { tower: 3 },
      type: 'endTurn',
    });
    expect(next.cash['a']).toBe(5400);
    expect(next.hands['a']).toHaveLength(1);
    expect(next.phase).toEqual({
      kind: 'placeTile',
      playerId: 'b',
    });
  });

  it('declares the end and scores the game', () => {
    let state = makeState({
      board: line('tower', 'A', 1, 11),
      phase: { kind: 'buyStock', playerId: 'a' },
    });
    state.stock['b'].tower = 2;
    state = run(state, 'a', { type: 'declareEnd' });
    state = run(state, 'a', { type: 'endTurn' });
    expect(state.phase).toEqual({ kind: 'gameOver' });
    // Tower at 11 tiles is $700; sole holder gets 7000 + 3500.
    expect(state.results?.finalCash['b']).toBe(
      6000 + 10500 + 1400,
    );
    expect(state.results?.winners).toEqual(['b']);
  });

  it('refuses to declare the end early', () => {
    const state = makeState({ board: line('tower', 'A', 1, 3) });
    expect(attempt(state, 'a', { type: 'declareEnd' }).ok).toBe(
      false,
    );
  });
});

describe('secrecy', () => {
  const state = makeState({
    board: line('tower', 'A', 1, 2),
    hands: { a: ['5E'], b: ['6F'] },
    secret: true,
  });

  it('hides other players cash, stock and hands', () => {
    const view = playerView(state, 'a');
    expect(view.players.every((p) => p.cash === undefined)).toBe(
      true,
    );
    expect(
      view.players.every((p) => p.stock === undefined),
    ).toBe(true);
    expect(view.me.cash).toBe(6000);
    expect(JSON.stringify(view)).not.toContain('6F');
    expect(JSON.stringify(publicView(state))).not.toMatch(
      /5E|6F/,
    );
  });

  it('redacts draws and trades for other viewers', () => {
    const { settings } = state;
    const draw: GameEvent = {
      playerId: 'a',
      tile: '9I',
      type: 'tileDrawn',
    };
    expect(redactEvent(draw, 'b', settings)).toEqual({
      playerId: 'a',
      type: 'tileDrawn',
    });
    expect(redactEvent(draw, 'a', settings)).toBe(draw);
    const buy: GameEvent = {
      cost: 600,
      playerId: 'a',
      purchases: { tower: 3 },
      type: 'stockPurchased',
    };
    expect(redactEvent(buy, null, settings)).toEqual({
      playerId: 'a',
      type: 'stockPurchased',
    });
    expect(
      redactEvent(buy, null, {
        ...settings,
        secretHoldings: false,
      }),
    ).toBe(buy);
  });
});
