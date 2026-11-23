import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { PanelComponent } from './panel';

@Component({
  imports: [PanelComponent],
  template: `<app-panel key="log" heading="Log"
    ><p class="content">Hello</p></app-panel
  >`,
})
class HostComponent {}

describe('PanelComponent', () => {
  afterEach(() => localStorage.clear());

  it('collapses its body and remembers the choice', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const toggle = el.querySelector('button')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelector('.content')).not.toBeNull();

    toggle.click();
    await fixture.whenStable();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('.content')).toBeNull();
    expect(
      JSON.parse(localStorage.getItem('acquire.collapsed')!),
    ).toEqual({ log: true });
  });
});
