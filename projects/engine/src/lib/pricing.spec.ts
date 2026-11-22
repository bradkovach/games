import { computeBonuses, sharePrice } from './pricing';
import { finalScore, rankPlayers } from './scoring';
import { compareTiles, neighbors } from './tiles';

describe('sharePrice', () => {
  it('follows the tier brackets', () => {
    expect(sharePrice('tower', 2)).toBe(200);
    expect(sharePrice('tower', 10)).toBe(600);
    expect(sharePrice('tower', 41)).toBe(1000);
    expect(sharePrice('festival', 5)).toBe(600);
    expect(sharePrice('festival', 41)).toBe(1100);
    expect(sharePrice('imperial', 2)).toBe(400);
    expect(sharePrice('imperial', 11)).toBe(900);
    expect(sharePrice('imperial', 45)).toBe(1200);
    expect(sharePrice('imperial', 0)).toBe(0);
  });
});

describe('computeBonuses', () => {
  // Imperial at 5 tiles: $700 -> 7000 / 5000 / 3500 in Tycoon.
  it('pays a classic sole holder both bonuses', () => {
    expect(
      computeBonuses({ a: 3 }, 'imperial', 5, 'classic'),
    ).toEqual({ a: 10500 });
  });

  it('splits a classic tie for first and skips second', () => {
    expect(
      computeBonuses(
        { a: 3, b: 3, c: 1 },
        'tower',
        2,
        'classic',
      ),
    ).toEqual({ a: 1500, b: 1500 });
  });

  it('splits a classic tie for second, rounding up', () => {
    expect(
      computeBonuses(
        { a: 4, b: 2, c: 2, d: 2 },
        'tower',
        2,
        'classic',
      ),
    ).toEqual({ a: 2000, b: 400, c: 400, d: 400 });
  });

  it('pays a tycoon sole holder primary and tertiary', () => {
    expect(
      computeBonuses({ a: 1 }, 'imperial', 5, 'tycoon'),
    ).toEqual({
      a: 10500,
    });
  });

  it('ignores tertiary with two tycoon holders', () => {
    expect(
      computeBonuses({ a: 3, b: 1 }, 'imperial', 5, 'tycoon'),
    ).toEqual({ a: 7000, b: 5000 });
  });

  it('matches the rulebook tycoon tie examples', () => {
    expect(
      computeBonuses(
        { c: 4, l: 4, x: 1 },
        'imperial',
        5,
        'tycoon',
      ),
    ).toEqual({ c: 6000, l: 6000, x: 3500 });
    expect(
      computeBonuses(
        { c: 2, l: 4, x: 2 },
        'imperial',
        5,
        'tycoon',
      ),
    ).toEqual({ c: 4300, l: 7000, x: 4300 });
    expect(
      computeBonuses(
        { a: 1, c: 2, l: 4, x: 1 },
        'imperial',
        5,
        'tycoon',
      ),
    ).toEqual({ a: 1800, c: 5000, l: 7000, x: 1800 });
  });

  it('pools bonuses for three-way ties', () => {
    expect(
      computeBonuses(
        { a: 2, b: 2, c: 2 },
        'imperial',
        5,
        'tycoon',
      ),
    ).toEqual({ a: 5200, b: 5200, c: 5200 });
  });
});

describe('finalScore', () => {
  it('pays bonuses, sells stock and ranks players', () => {
    const results = finalScore({
      chainSizes: { sackson: 0, tower: 2 },
      mode: 'classic',
      players: [
        {
          id: 'a',
          cash: 1000,
          holdings: { sackson: 5, tower: 2 },
        },
        { id: 'b', cash: 1400, holdings: { tower: 1 } },
      ],
    });
    expect(results.finalCash).toEqual({ a: 3400, b: 2600 });
    expect(results.sales).toEqual({ a: 400, b: 200 });
    expect(results.winners).toEqual(['a']);
    expect(
      rankPlayers({ a: 5, b: 9, c: 5 }).map((r) => r.place),
    ).toEqual([1, 2, 2]);
  });
});

describe('tiles', () => {
  it('ranks row letter before number', () => {
    expect(compareTiles('9A', '1B')).toBeLessThan(0);
    expect(compareTiles('2A', '1A')).toBeGreaterThan(0);
  });

  it('has orthogonal neighbors only', () => {
    expect(neighbors('1A').sort()).toEqual(['1B', '2A']);
    expect(neighbors('12I').sort()).toEqual(['11I', '12H']);
  });
});
