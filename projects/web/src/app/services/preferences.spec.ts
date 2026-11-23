import { TestBed } from '@angular/core/testing';

import { PreferencesService } from './preferences';

describe('PreferencesService', () => {
  afterEach(() => localStorage.clear());

  it('reads stored choices and defaults auto-end on', () => {
    localStorage.setItem('acquire.hideNav', 'true');
    localStorage.setItem('acquire.collapsed', '{"log":true}');
    const prefs = TestBed.inject(PreferencesService);
    TestBed.tick();
    expect(prefs.hideNav()).toBe(true);
    expect(prefs.hideBoard()).toBe(false);
    expect(prefs.autoEndTurn()).toBe(true);
    expect(prefs.isCollapsed('log')).toBe(true);
    expect(localStorage.getItem('acquire.hideNav')).toBe('true');
  });
});
