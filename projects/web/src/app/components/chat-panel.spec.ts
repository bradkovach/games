import { TestBed } from '@angular/core/testing';

import { ChatPanelComponent } from './chat-panel';

describe('ChatPanelComponent', () => {
  async function render(canSend: boolean) {
    const fixture = TestBed.createComponent(ChatPanelComponent);
    fixture.componentRef.setInput('messages', [
      { at: 1, playerId: 'a', text: 'Nice merger' },
    ]);
    fixture.componentRef.setInput(
      'names',
      new Map([['a', 'Ann']]),
    );
    fixture.componentRef.setInput('canSend', canSend);
    await fixture.whenStable();
    return {
      el: fixture.nativeElement as HTMLElement,
      instance: fixture.componentInstance,
    };
  }

  it('shows messages with the speaker', async () => {
    const { el } = await render(false);
    expect(el.querySelector('li')?.textContent).toMatch(
      /Ann:\s*Nice merger/,
    );
    expect(el.querySelector('form')).toBeNull();
  });

  it('emits trimmed text and clears the box', async () => {
    const { el, instance } = await render(true);
    const said: string[] = [];
    instance.say.subscribe((text) => said.push(text));
    const box = el.querySelector('input')!;
    const form = el.querySelector('form')!;
    box.value = '   ';
    form.dispatchEvent(new Event('submit'));
    box.value = '  hello  ';
    form.dispatchEvent(new Event('submit'));
    expect(said).toEqual(['hello']);
    expect(box.value).toBe('');
  });
});
