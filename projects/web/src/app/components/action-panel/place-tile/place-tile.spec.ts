import { TestBed } from '@angular/core/testing';

import { GameClient } from '../../../services/game-client';
import { makeTestView, stubClient } from '../test-view';
import { PlaceTileComponent } from './place-tile';

describe('PlaceTileComponent', () => {
  function render(
    hand: { status: 'dead' | 'playable'; tile: string }[],
  ) {
    const { client, sent } = stubClient();
    TestBed.configureTestingModule({
      providers: [{ provide: GameClient, useValue: client }],
    });
    const fixture = TestBed.createComponent(PlaceTileComponent);
    fixture.componentRef.setInput(
      'view',
      makeTestView({
        me: { ...makeTestView().me, hand: hand as never },
        phase: { kind: 'placeTile', playerId: 'a' },
      }),
    );
    TestBed.tick();
    return { el: fixture.nativeElement as HTMLElement, sent };
  }

  it('places a playable tile and disables dead ones', () => {
    const { el, sent } = render([
      { status: 'playable', tile: '1A' },
      { status: 'dead', tile: '5C' },
    ]);
    const [playable, dead] =
      el.querySelectorAll<HTMLButtonElement>('.hand button');
    expect(dead.disabled).toBe(true);
    playable.click();
    expect(sent).toEqual([{ type: 'placeTile', tile: '1A' }]);
  });

  it('offers to skip only without a playable tile', () => {
    expect(
      render([{ status: 'playable', tile: '1A' }]).el
        .textContent,
    ).not.toContain('skip');
    TestBed.resetTestingModule();
    const { el, sent } = render([
      { status: 'dead', tile: '5C' },
    ]);
    el.querySelector<HTMLButtonElement>('.row button')!.click();
    expect(sent).toEqual([{ type: 'passPlacement' }]);
  });
});
