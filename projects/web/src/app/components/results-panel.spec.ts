import { TestBed } from '@angular/core/testing';

import { ResultsPanelComponent } from './results-panel';

describe('ResultsPanelComponent', () => {
  it('shows cash, bonuses and sales adding up to net worth', async () => {
    const fixture = TestBed.createComponent(
      ResultsPanelComponent,
    );
    fixture.componentRef.setInput('results', {
      bonuses: { festival: { a: 8000, b: 4000 } },
      finalCash: { a: 21600, b: 12300 },
      sales: { a: 8000, b: 4800 },
      winners: ['a'],
    });
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const cells = (row: number) =>
      [
        ...el
          .querySelectorAll('tbody tr')
          [row].querySelectorAll('td'),
      ]
        .slice(2)
        .map((td) => td.textContent?.trim());

    expect(el.querySelector('thead')?.textContent).toContain(
      'Cash',
    );
    expect(cells(0)).toEqual([
      '$5,600',
      '$8,000',
      '$8,000',
      '$21,600',
    ]);
    expect(cells(1)).toEqual([
      '$3,500',
      '$4,000',
      '$4,800',
      '$12,300',
    ]);
    expect(el.textContent).toContain('a $8,000, b $4,000');
  });
});
