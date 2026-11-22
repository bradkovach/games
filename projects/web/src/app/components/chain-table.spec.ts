import type { ChainSummary } from 'engine';

import { TestBed } from '@angular/core/testing';

import { ChainTableComponent } from './chain-table';

describe('ChainTableComponent', () => {
  it('mutes inactive chains and shows your holdings', async () => {
    const chains: ChainSummary[] = [
      {
        active: true,
        bank: 20,
        chain: 'tower',
        price: 300,
        safe: false,
        size: 3,
      },
      {
        active: false,
        bank: 25,
        chain: 'imperial',
        price: 0,
        safe: false,
        size: 0,
      },
    ];
    const fixture = TestBed.createComponent(ChainTableComponent);
    fixture.componentRef.setInput('chains', chains);
    fixture.componentRef.setInput('mine', {
      american: 0,
      continental: 0,
      festival: 0,
      imperial: 0,
      sackson: 0,
      tower: 5,
      worldwide: 0,
    });
    await fixture.whenStable();
    const rows = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll(
        'tbody tr',
      ),
    ];
    const text = (tr: Element) =>
      [...tr.children].map((c) => c.textContent?.trim());

    expect(text(rows[0])).toEqual([
      'Tower',
      '3',
      '$300',
      '20',
      '5',
    ]);
    expect(rows[0].classList).not.toContain('inactive');
    expect(text(rows[1])).toEqual([
      'Imperial',
      '–',
      '–',
      '25',
      '0',
    ]);
    expect(rows[1].classList).toContain('inactive');
  });
});
