import {
  emptyScoreboard,
  parseScoreboard,
  score,
  type ScoreboardState,
  warnings,
} from './scoreboard-model';

const sample: ScoreboardState = {
  chainSizes: { sackson: 5, tower: 12 },
  mode: 'classic',
  players: [
    { id: 'a', cash: 1000, holdings: { tower: 5 }, name: 'A' },
    {
      id: 'b',
      cash: 2000,
      holdings: { sackson: 3, tower: 2 },
      name: 'B',
    },
  ],
};

describe('scoreboard model', () => {
  it('scores bonuses and stock sales', () => {
    const results = score(sample)!;
    // tower size 12 → $700; sackson size 5 → $500 (sole holder).
    expect(results.bonuses.tower).toEqual({ a: 7000, b: 3500 });
    expect(results.bonuses.sackson).toEqual({ b: 7500 });
    expect(results.finalCash).toEqual({
      a: 1000 + 7000 + 5 * 700,
      b: 2000 + 3500 + 7500 + 2 * 700 + 3 * 500,
    });
    expect(results.winners).toEqual(['b']);
  });

  it('warns about impossible holdings', () => {
    const state: ScoreboardState = {
      ...sample,
      chainSizes: { tower: 12 },
      players: [
        { id: 'a', cash: 0, holdings: { tower: 20 }, name: 'A' },
        {
          id: 'b',
          cash: 0,
          holdings: { sackson: 1, tower: 6 },
          name: 'B',
        },
      ],
    };
    const result = warnings(state);
    expect(result.some((w) => w.startsWith('tower: 26'))).toBe(
      true,
    );
    expect(result.some((w) => w.startsWith('sackson'))).toBe(
      true,
    );
  });

  it('recovers from corrupt storage', () => {
    expect(parseScoreboard('{oops').players.length).toBe(
      emptyScoreboard().players.length,
    );
    expect(parseScoreboard(JSON.stringify(sample))).toEqual(
      sample,
    );
  });
});
