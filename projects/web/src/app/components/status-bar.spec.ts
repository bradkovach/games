import { TestBed } from '@angular/core/testing';

import { StatusBarComponent } from './status-bar';

describe('StatusBarComponent', () => {
  it('shows name, cash and display-only tiles', async () => {
    const fixture = TestBed.createComponent(StatusBarComponent);
    const ref = fixture.componentRef;
    ref.setInput('name', 'Ada');
    ref.setInput('avatar', '♞');
    ref.setInput('cash', 6000);
    ref.setInput('bagCount', 80);
    ref.setInput('cue', 'Your turn');
    ref.setInput('turn', true);
    ref.setInput('hand', [
      { status: 'playable', tile: '1A' },
      { status: 'dead', tile: '5C' },
    ]);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.classList).toContain('turn');
    expect(el.querySelector('.who')?.textContent).toContain(
      'Ada',
    );
    expect(el.querySelector('.cash')?.textContent).toContain(
      '$6,000',
    );
    const tiles = [...el.querySelectorAll('.tiles li')];
    expect(tiles.map((t) => t.className)).toEqual([
      'playable',
      'dead',
    ]);
    expect(tiles[1].getAttribute('title')).toMatch(/^Dead/);
    expect(el.querySelector('button')).toBeNull();
    expect(el.textContent).toContain('80 in bag');
  });

  it('omits cash and tiles for spectators', async () => {
    const fixture = TestBed.createComponent(StatusBarComponent);
    fixture.componentRef.setInput('name', 'Bob');
    fixture.componentRef.setInput('bagCount', 12);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.cash')).toBeNull();
    expect(el.querySelector('.tiles')).toBeNull();
  });
});
