import type { ChainSummary, PlayerSummary } from 'engine';

import { TestBed } from '@angular/core/testing';

import { InfoTableComponent, stockMedals } from './info-table';

const chain = (
  id: ChainSummary['chain'],
  active = true,
): ChainSummary => ({
  active,
  bank: 25,
  chain: id,
  price: active ? 300 : 0,
  safe: false,
  size: active ? 3 : 0,
});

const player = (
  id: string,
  stock: PlayerSummary['stock'] = undefined,
  cash: number | undefined = 6000,
): PlayerSummary => ({
  id,
  cash,
  handCount: 6,
  name: id.toUpperCase(),
  stock,
});

const holdings = (counts: Partial<Record<string, number>>) => ({
  american: 0,
  continental: 0,
  festival: 0,
  imperial: 0,
  sackson: 0,
  tower: 0,
  worldwide: 0,
  ...counts,
});

describe('stockMedals', () => {
  it('gives tied leaders gold and no silver in classic', () => {
    const players = [
      player('a', holdings({ continental: 4 })),
      player('b', holdings({ continental: 4 })),
      player('c', holdings({ continental: 2 })),
    ];
    expect(
      stockMedals(players, [chain('continental')], 'classic'),
    ).toEqual({ continental: { a: 1, b: 1 } });
  });

  it('awards gold, silver and (tycoon only) bronze', () => {
    const players = [
      player('a', holdings({ tower: 5 })),
      player('b', holdings({ tower: 3 })),
      player('c', holdings({ tower: 1 })),
      player('d', holdings({ tower: 0 })),
    ];
    expect(
      stockMedals(players, [chain('tower')], 'classic'),
    ).toEqual({ tower: { a: 1, b: 2 } });
    expect(
      stockMedals(players, [chain('tower')], 'tycoon'),
    ).toEqual({ tower: { a: 1, b: 2, c: 3 } });
  });

  it('shares silver between tied runners-up', () => {
    const players = [
      player('a', holdings({ tower: 5 })),
      player('b', holdings({ tower: 2 })),
      player('c', holdings({ tower: 2 })),
    ];
    expect(
      stockMedals(players, [chain('tower')], 'tycoon'),
    ).toEqual({ tower: { a: 1, b: 2, c: 2 } });
  });

  it('skips inactive chains and hidden holdings', () => {
    const players = [
      player('a', holdings({ tower: 5 })),
      player('b'),
    ];
    expect(
      stockMedals(
        players,
        [chain('tower', false), chain('sackson')],
        'classic',
      ),
    ).toEqual({ sackson: {} });
  });
});

describe('InfoTableComponent', () => {
  async function render(
    players: PlayerSummary[],
    options: {
      chains?: ChainSummary[];
      me?: { cash: number; stock: PlayerSummary['stock'] };
      you?: string;
    } = {},
  ) {
    const fixture = TestBed.createComponent(InfoTableComponent);
    const ref = fixture.componentRef;
    ref.setInput('players', players);
    ref.setInput(
      'chains',
      options.chains ?? [
        chain('tower'),
        chain('imperial', false),
      ],
    );
    ref.setInput('gameMode', 'classic');
    ref.setInput('active', 'b');
    ref.setInput('avatars', new Map([['a', '♞']]));
    if (options.you) ref.setInput('you', options.you);
    if (options.me) ref.setInput('me', options.me);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const cells = (tr: Element | null | undefined) =>
    [...(tr?.children ?? [])].map((c) => c.textContent?.trim());

  const rowOf = (el: HTMLElement, name: string) =>
    [...el.querySelectorAll('tbody tr')].find(
      (tr) =>
        tr.querySelector('th')?.textContent?.trim() === name,
    );

  it('combines chain market data with player holdings', async () => {
    const el = await render([
      player('a', holdings({ tower: 4 }), 5000),
      player('b', holdings({ tower: 4 }), 7000),
    ]);
    const headers = [...el.querySelectorAll('thead th')];
    expect(headers.map((th) => th.textContent?.trim())).toEqual([
      'Asset',
      'Size',
      '$/share',
      'Avail',
      '♞A',
      '▶Current turn:B',
    ]);
    expect(headers[5].classList).toContain('turn');

    const rows = [...el.querySelectorAll('tbody tr')];
    expect(rows).toHaveLength(8);
    expect(cells(rows[0])).toEqual(['Cash', '$5,000', '$7,000']);
    expect(rows.slice(1).map((r) => cells(r)[0])).toEqual([
      'Sackson',
      'Tower',
      'American',
      'Festival',
      'Worldwide',
      'Continental',
      'Imperial',
    ]);
    expect(cells(rowOf(el, 'Tower'))).toEqual([
      'Tower',
      '3',
      '$300',
      '25',
      '4',
      '4',
    ]);
    const imperial = rowOf(el, 'Imperial');
    expect(cells(imperial)).toEqual([
      'Imperial',
      '–',
      '–',
      '25',
      '0',
      '0',
    ]);
    expect(imperial?.classList).toContain('inactive');
  });

  it('shows ranked holdings as coins with staggered gloss', async () => {
    const el = await render([
      player('a', holdings({ tower: 5 })),
      player('b', holdings({ tower: 3 })),
      player('c', holdings({ tower: 1 })),
    ]);
    const coins = [
      ...(rowOf(el, 'Tower')?.querySelectorAll('.coin') ?? []),
    ] as HTMLElement[];
    expect(
      coins.map((c) => [
        c.textContent?.trim(),
        c.className,
        c.title,
        c.style.getPropertyValue('--gloss-delay'),
      ]),
    ).toEqual([
      ['5', 'coin medal-1', 'Majority holder', '0.6s'],
      ['3', 'coin medal-2', 'Minority holder', '1.2s'],
    ]);
    expect(
      rowOf(el, 'Tower')?.querySelectorAll('td')[5].textContent,
    ).toContain('1');
  });

  it('fills only your own column in secret games', async () => {
    const hidden = (id: string): PlayerSummary => ({
      id,
      handCount: 6,
      name: id.toUpperCase(),
    });
    const el = await render([hidden('a'), hidden('b')], {
      me: { cash: 4200, stock: holdings({ tower: 2 }) },
      you: 'a',
    });
    expect(cells(el.querySelector('tbody tr'))).toEqual([
      'Cash',
      '$4,200',
      '–',
    ]);
    expect(cells(rowOf(el, 'Tower')).slice(4)).toEqual([
      '2',
      '–',
    ]);
    expect(el.querySelectorAll('.coin')).toHaveLength(0);
    expect(
      el.querySelector('td.hidden')?.getAttribute('title'),
    ).toBe('Secret until the game ends');
  });
});
