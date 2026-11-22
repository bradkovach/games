import { TestBed } from '@angular/core/testing';

import { formatTicker, TickerComponent } from './ticker';

describe('formatTicker', () => {
  it('formats numbers and currency', () => {
    expect(formatTicker(12345, 'number')).toBe('12,345');
    expect(formatTicker(6000, 'currency')).toBe('$6,000');
    expect(formatTicker(-300, 'currency')).toBe('−$300');
  });
});

describe('TickerComponent', () => {
  it('flashes up or down when the value changes', async () => {
    const fixture = TestBed.createComponent(TickerComponent);
    const host = fixture.nativeElement as HTMLElement;
    fixture.componentRef.setInput('value', 300);
    fixture.componentRef.setInput('format', 'currency');
    await fixture.whenStable();
    expect(host.textContent?.trim()).toContain('$300');
    expect(host.className).toBe('');
    expect(host.title).toBe('');

    fixture.componentRef.setInput('value', 400);
    await fixture.whenStable();
    expect(host.classList).toContain('up');
    expect(host.querySelector('.arrow')?.textContent).toBe('▲');
    expect(host.title).toBe('Was $300');

    fixture.componentRef.setInput('value', 200);
    await fixture.whenStable();
    expect(host.classList).toContain('down');
    expect(host.querySelector('.arrow')?.textContent).toBe('▼');
  });
});
