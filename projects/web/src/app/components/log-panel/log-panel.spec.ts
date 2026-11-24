import type { GameEvent } from 'engine';

import { TestBed } from '@angular/core/testing';

import { LogPanelComponent } from './log-panel';

describe('LogPanelComponent', () => {
  it('lists events oldest first', async () => {
    const events = [
      { type: 'tilePlaced', playerId: 'a', tile: '1A' },
      { type: 'tileDrawn', playerId: 'a' },
      { type: 'tilePlaced', playerId: 'b', tile: '2B' },
    ] as GameEvent[];
    const fixture = TestBed.createComponent(LogPanelComponent);
    fixture.componentRef.setInput('events', events);
    fixture.componentRef.setInput(
      'names',
      new Map([
        ['a', 'Ann'],
        ['b', 'Bob'],
      ]),
    );
    await fixture.whenStable();
    const items = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll(
        'li',
      ),
    ].map((li) => li.textContent?.trim());
    expect(items).toEqual(['Ann placed 1A', 'Bob placed 2B']);
  });
});
