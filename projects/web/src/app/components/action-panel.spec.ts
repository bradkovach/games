import type { CommandInput, PlayerView } from 'engine';

import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { GameClient } from '../services/game-client';
import { PreferencesService } from '../services/preferences';
import {
  ActionPanelComponent,
  AUTO_END_DELAY_MS,
} from './action-panel';

const STOCK = {
  american: 0,
  continental: 0,
  festival: 0,
  imperial: 0,
  sackson: 0,
  tower: 0,
  worldwide: 0,
};

function makeView(
  overrides: Partial<PlayerView> & {
    cash?: number;
    playable?: boolean;
  } = {},
): PlayerView {
  const { cash = 6000, playable = true, ...rest } = overrides;
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
      id: 'a',
      cash,
      hand: [
        {
          status: playable ? 'playable' : 'dead',
          tile: '1A',
        },
      ],
      stock: { ...STOCK },
    },
    phase: { kind: 'buyStock', playerId: 'a' },
    players: [],
    settings: { mode: 'classic', secretHoldings: false },
    ...rest,
  };
}

describe('ActionPanelComponent', () => {
  let view: ReturnType<typeof signal<null | PlayerView>>;
  let sent: CommandInput[];

  async function render() {
    view = signal<null | PlayerView>(makeView());
    sent = [];
    TestBed.configureTestingModule({
      providers: [
        {
          provide: GameClient,
          useValue: {
            avatars: computed(
              () => new Map([['b', '⚓\u{FE0F}']]),
            ),
            error: signal(null),
            names: computed(() => new Map([['b', 'Bob']])),
            send: (command: CommandInput) => sent.push(command),
            view,
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(
      ActionPanelComponent,
    );
    TestBed.tick();
    const el = fixture.nativeElement as HTMLElement;
    return { el, fixture };
  }

  const plus = (el: HTMLElement) =>
    el.querySelectorAll<HTMLButtonElement>(
      '.actions__action',
    )[1];

  it('keeps pending purchases across rebroadcasts', async () => {
    const { el, fixture } = await render();
    plus(el).click();
    plus(el).click();
    await fixture.whenStable();
    expect(el.querySelector('tfoot')?.textContent).toContain(
      '$600',
    );

    // The server re-sends the same decision as a new object.
    view.set(makeView());
    await fixture.whenStable();
    expect(el.querySelector('tfoot')?.textContent).toContain(
      '$600',
    );

    view.set(
      makeView({ phase: { kind: 'placeTile', playerId: 'b' } }),
    );
    await fixture.whenStable();
    expect(el.textContent).toContain(
      'Waiting for ⚓\u{FE0F} Bob',
    );
    view.set(makeView());
    await fixture.whenStable();
    expect(el.querySelector('tfoot')?.textContent).toContain(
      '$0',
    );
  });

  describe('auto-end', () => {
    // Fake timers stall whenStable, so flush with TestBed.tick().
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => {
      vi.useRealTimers();
      localStorage.clear();
    });

    it('ends the turn when nothing is affordable', async () => {
      const { el } = await render();
      TestBed.inject(PreferencesService).autoEndTurn.set(true);
      view.set(makeView({ cash: 100 }));
      TestBed.tick();
      expect(el.textContent).toContain('ending your turn');

      vi.advanceTimersByTime(AUTO_END_DELAY_MS);
      expect(sent).toEqual([
        { type: 'endTurn', discardDead: true, purchases: {} },
      ]);
    });

    it('skips placement without a playable tile', async () => {
      await render();
      TestBed.inject(PreferencesService).autoEndTurn.set(true);
      view.set(
        makeView({
          phase: { kind: 'placeTile', playerId: 'a' },
          playable: false,
        }),
      );
      TestBed.tick();
      vi.advanceTimersByTime(AUTO_END_DELAY_MS);
      expect(sent).toEqual([{ type: 'passPlacement' }]);
    });

    it('ends the turn when cash is short of every share left', async () => {
      const { el } = await render();
      TestBed.inject(PreferencesService).autoEndTurn.set(true);
      view.set(
        makeView({
          cash: 600,
          chains: [
            {
              active: true,
              bank: 10,
              chain: 'worldwide',
              price: 800,
              safe: true,
              size: 13,
            },
            {
              active: true,
              bank: 0,
              chain: 'tower',
              price: 300,
              safe: false,
              size: 3,
            },
            {
              active: false,
              bank: 25,
              chain: 'sackson',
              price: 0,
              safe: false,
              size: 0,
            },
          ],
        }),
      );
      TestBed.tick();
      expect(el.textContent).toContain('ending your turn');
      vi.advanceTimersByTime(AUTO_END_DELAY_MS);
      expect(sent).toEqual([
        { type: 'endTurn', discardDead: true, purchases: {} },
      ]);
    });

    it('waits while a share is affordable', async () => {
      await render();
      TestBed.inject(PreferencesService).autoEndTurn.set(true);
      view.set(makeView({ cash: 300 }));
      TestBed.tick();
      vi.advanceTimersByTime(AUTO_END_DELAY_MS * 2);
      expect(sent).toEqual([]);
    });

    it('explains why it waits when the end can be declared', async () => {
      const { el } = await render();
      TestBed.inject(PreferencesService).autoEndTurn.set(true);
      view.set(makeView({ canDeclareEnd: true, cash: 100 }));
      TestBed.tick();
      vi.advanceTimersByTime(AUTO_END_DELAY_MS * 2);
      expect(sent).toEqual([]);
      expect(el.textContent).not.toContain('ending your turn');
      expect(
        el.querySelector('.auto-end.held')?.textContent,
      ).toContain('you can declare the game over');
    });

    it('says when no shares are for sale', async () => {
      const { el } = await render();
      view.set(makeView({ chains: [] }));
      TestBed.tick();
      expect(
        el.querySelector('.no-shares')?.textContent,
      ).toContain('There are no shares available for purchase.');
      view.set(makeView());
      TestBed.tick();
      expect(el.querySelector('.no-shares')).toBeNull();
    });

    it('declaring the end while buying also finishes the turn', async () => {
      const { el } = await render();
      vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
      view.set(makeView({ canDeclareEnd: true }));
      TestBed.tick();
      el.querySelector<HTMLButtonElement>(
        'button.secondary',
      )!.click();
      expect(sent).toEqual([
        { type: 'declareEnd' },
        { type: 'endTurn', discardDead: true, purchases: {} },
      ]);
    });

    it('can be cancelled for the current decision', async () => {
      const { el } = await render();
      TestBed.inject(PreferencesService).autoEndTurn.set(true);
      view.set(makeView({ cash: 0 }));
      TestBed.tick();
      el.querySelector<HTMLButtonElement>(
        '.auto-end button',
      )?.click();
      TestBed.tick();
      view.set(makeView({ cash: 0 }));
      TestBed.tick();
      vi.advanceTimersByTime(AUTO_END_DELAY_MS * 2);
      expect(sent).toEqual([]);
      expect(el.textContent).not.toContain('ending your turn');
    });

    it('stays off unless the player opts in', async () => {
      const { el } = await render();
      view.set(makeView({ canDeclareEnd: true, cash: 0 }));
      TestBed.tick();
      vi.advanceTimersByTime(AUTO_END_DELAY_MS * 2);
      expect(sent).toEqual([]);
      expect(el.querySelector('.auto-end')).toBeNull();
    });
  });
});
