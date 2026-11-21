import { TestBed } from '@angular/core/testing';

import { BoardComponent } from './board';

describe('BoardComponent', () => {
  it('colors tiles by chain and labels them', async () => {
    const fixture = TestBed.createComponent(BoardComponent);
    fixture.componentRef.setInput('board', {
      '1A': 'tower',
      '2A': 'tower',
      '5C': null,
    });
    await fixture.whenStable();
    const cell = (label: string) =>
      (fixture.nativeElement as HTMLElement).querySelector(
        `[aria-label^="${label}"]`,
      ) as HTMLElement;

    expect(
      cell('1A').style.getPropertyValue('--tile-color'),
    ).toBe('var(--tower)');
    expect(cell('1A').title).toBe('1A Tower');
    expect(
      cell('5C').style.getPropertyValue('--tile-color'),
    ).toBe('');
  });
});
