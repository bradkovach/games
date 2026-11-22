import type { ChainSummary, PlayerSummary } from 'engine';

import { TestBed } from '@angular/core/testing';

import {
  PlayersPanelComponent,
  stockMedals,
} from './players-panel';

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

describe('PlayersPanelComponent', () => {
  async function render(
    players: PlayerSummary[],
    chains: ChainSummary[] = [chain('tower')],
  ) {
    const fixture = TestBed.createComponent(
      PlayersPanelComponent,
    );
    fixture.componentRef.setInput('players', players);
    fixture.componentRef.setInput('chains', chains);
    fixture.componentRef.setInput('gameMode', 'classic');
    fixture.componentRef.setInput('active', 'b');
    fixture.componentRef.setInput(
      'avatars',
      new Map([['a', '♞']]),
    );
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('puts players in columns and assets in rows', async () => {
    const el = await render([
      player('a', holdings({ tower: 4 }), 5000),
      player('b', holdings({ tower: 4 }), 7000),
    ]);
    const headers = [...el.querySelectorAll('thead th')];
    expect(
      headers.map((th) => th.getAttribute('title')),
    ).toEqual([null, 'A', 'B']);
    expect(
      headers[1].querySelector('.avatar')?.textContent,
    ).toBe('♞');
    expect(headers[2].classList).toContain('turn');
    expect(
      headers
        .slice(1)
        .map((th) => [
          th.querySelector('.avatar')?.textContent ?? null,
          th.querySelector('.name')?.textContent,
        ]),
    ).toEqual([
      ['♞', 'A'],
      [null, 'B'],
    ]);
    expect(
      el
        .querySelector('table')
        ?.style.getPropertyValue('--player-width'),
    ).toBe('50%');

    const rows = [...el.querySelectorAll('tbody tr')].map((tr) =>
      [...tr.children].map((c) => c.textContent?.trim()),
    );
    expect(rows[0]).toEqual(['Cash', '$5,000', '$7,000']);
    expect(rows).toHaveLength(8);
    expect(rows.slice(1).map((r) => r[0])).toEqual([
      'Sackson',
      'Tower',
      'American',
      'Festival',
      'Worldwide',
      'Continental',
      'Imperial',
    ]);

    const tower = el
      .querySelector('tbody th[title="Tower"]')
      ?.closest('tr') as HTMLElement;
    const cells = [...tower.querySelectorAll('td')];
    expect(cells.map((c) => c.className.trim())).toEqual([
      'num medal medal-1',
      'num medal medal-1',
    ]);
    expect(
      cells.map((c) =>
        c.style.getPropertyValue('--shine-delay'),
      ),
    ).toEqual(['0.25s', '0.5s']);
  });

  it('hides holdings in secret games', async () => {
    const hidden = (id: string): PlayerSummary => ({
      id,
      handCount: 6,
      name: id,
    });
    const el = await render([hidden('a'), hidden('b')]);
    expect(el.querySelector('tbody')?.textContent).toContain(
      'Holdings are secret',
    );
    expect(el.querySelectorAll('app-ticker')).toHaveLength(0);
  });
});
