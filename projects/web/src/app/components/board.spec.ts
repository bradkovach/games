import { TestBed } from '@angular/core/testing';

import { BoardComponent } from './board';
import { TILE_HINTS, tileHints } from './tile-hints';

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

  it('explains why a held tile cannot be played', async () => {
    const fixture = TestBed.createComponent(BoardComponent);
    fixture.componentRef.setInput('board', {});
    fixture.componentRef.setInput('hand', ['5A', '6E', '8F']);
    fixture.componentRef.setInput(
      'hints',
      tileHints([
        { status: 'unplayable', tile: '5A' },
        { status: 'playable', tile: '6E' },
        { status: 'dead', tile: '8F' },
      ]),
    );
    await fixture.whenStable();
    const title = (tile: string) =>
      (
        (fixture.nativeElement as HTMLElement).querySelector(
          `[aria-label^="${tile}"]`,
        ) as HTMLElement
      ).title;

    expect(title('5A')).toBe(`5A. ${TILE_HINTS.unplayable}`);
    expect(title('6E')).toBe('6E');
    expect(title('8F')).toBe(`8F. ${TILE_HINTS.dead}`);
  });
});
