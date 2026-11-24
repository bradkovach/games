import { TestBed } from '@angular/core/testing';

import { GameClient } from '../../../services/game-client';
import { makeTestView, stubClient } from '../test-view';
import { BuyStockComponent } from './buy-stock';

describe('BuyStockComponent', () => {
  function render(view = makeTestView()) {
    const { client, sent } = stubClient();
    TestBed.configureTestingModule({
      providers: [{ provide: GameClient, useValue: client }],
    });
    const fixture = TestBed.createComponent(BuyStockComponent);
    fixture.componentRef.setInput('view', view);
    TestBed.tick();
    return {
      el: fixture.nativeElement as HTMLElement,
      fixture,
      sent,
    };
  }

  it('totals the cost and sends the purchases', async () => {
    const { el, fixture, sent } = render();
    const plus = () =>
      el.querySelectorAll<HTMLButtonElement>(
        '.actions__action',
      )[1];
    plus().click();
    plus().click();
    await fixture.whenStable();
    expect(el.querySelector('tfoot')?.textContent).toContain(
      '$600',
    );
    el.querySelector<HTMLButtonElement>('.row button')!.click();
    expect(sent).toEqual([
      {
        type: 'endTurn',
        discardDead: true,
        purchases: { tower: 2 },
      },
    ]);
  });

  it('stops at three shares', async () => {
    const { el, fixture } = render();
    const plus = () =>
      el.querySelectorAll<HTMLButtonElement>(
        '.actions__action',
      )[1];
    for (let i = 0; i < 3; i++) {
      plus().click();
      await fixture.whenStable();
    }
    expect(plus().disabled).toBe(true);
  });

  it('says when no shares are for sale', () => {
    const { el } = render(makeTestView({ chains: [] }));
    expect(el.querySelector('.no-shares')).not.toBeNull();
  });
});
