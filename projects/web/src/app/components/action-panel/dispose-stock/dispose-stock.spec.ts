import { TestBed } from '@angular/core/testing';

import { GameClient } from '../../../services/game-client';
import { makeTestView, STOCK, stubClient } from '../test-view';
import { DisposeStockComponent } from './dispose-stock';

describe('DisposeStockComponent', () => {
  async function render() {
    const { client, sent } = stubClient();
    TestBed.configureTestingModule({
      providers: [{ provide: GameClient, useValue: client }],
    });
    const fixture = TestBed.createComponent(
      DisposeStockComponent,
    );
    fixture.componentRef.setInput('acquired', 'sackson');
    fixture.componentRef.setInput('survivor', 'tower');
    fixture.componentRef.setInput(
      'view',
      makeTestView({
        chains: [
          {
            active: true,
            bank: 1,
            chain: 'tower',
            price: 300,
            safe: false,
            size: 8,
          },
          {
            active: false,
            bank: 22,
            chain: 'sackson',
            price: 400,
            safe: false,
            size: 0,
          },
        ],
        me: {
          cash: 6000,
          hand: [],
          id: 'a',
          stock: { ...STOCK, sackson: 5 },
        },
      }),
    );
    TestBed.tick();
    const el = fixture.nativeElement as HTMLElement;
    const button = (label: string) =>
      el.querySelector<HTMLButtonElement>(
        `button[aria-label="${label}"]`,
      )!;
    return { button, el, fixture, sent };
  }

  it('limits the steppers to the shares held and the bank', async () => {
    const { button, el, fixture, sent } = await render();
    // The survivor's bank holds 1 share, so at most 2 trade in.
    button('Trade two more').click();
    await fixture.whenStable();
    expect(button('Trade two more').disabled).toBe(true);
    // 1 Tower ($300) for 2 Sackson ($400 each) loses $500.
    expect(el.querySelector('.prices')?.textContent).toContain(
      '−$500',
    );
    expect(el.querySelector('.net')?.textContent).toContain(
      '−$500',
    );
    for (let i = 0; i < 3; i++) {
      button('Sell one more').click();
      await fixture.whenStable();
    }
    expect(button('Sell one more').disabled).toBe(true);
    expect(el.querySelector('.keep')?.textContent?.trim()).toBe(
      '0',
    );
    expect(el.textContent).toContain('Cash +$1,200');
    el.querySelector<HTMLButtonElement>(
      'p button:not(.secondary)',
    )!.click();
    expect(sent).toEqual([
      { type: 'disposeStock', sell: 3, trade: 2 },
    ]);
  });
});
