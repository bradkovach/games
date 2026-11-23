import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';

import {
  CHAT_MAX,
  type ChatMessage,
} from '../../shared/protocol';

/** Table talk: a scrolling list with an optional composer. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-chat-panel',
  styles: `
    ul {
      font-size: 0.9rem;
      list-style: none;
      margin: 0 0 0.5rem;
      max-height: 12rem;
      overflow-y: auto;
      padding: 0;
    }
    li {
      overflow-wrap: anywhere;
      padding: 0.15rem 0;
    }
    .who {
      font-weight: 700;
      margin-right: 0.35rem;
    }
    form {
      display: flex;
      gap: 0.5rem;
    }
    input {
      flex: 1;
      min-width: 0;
    }
  `,
  template: `
    <ul #list aria-live="polite">
      @for (m of messages(); track $index) {
        <li>
          <span class="who" [title]="name(m.playerId)"
            ><span class="emoji" aria-hidden="true">{{
              avatars().get(m.playerId)
            }}</span>
            {{ name(m.playerId) }}:</span
          >{{ m.text }}
        </li>
      } @empty {
        <li class="muted">No table talk yet.</li>
      }
    </ul>
    @if (canSend()) {
      <form (submit)="submit($event, box)">
        <input
          #box
          type="text"
          aria-label="Say something to the table"
          placeholder="Say something…"
          autocomplete="off"
          [attr.maxlength]="max"
        />
        <button type="submit" class="secondary">Send</button>
      </form>
      @if (error(); as error) {
        <p class="error">{{ error }}</p>
      }
    }
  `,
})
export class ChatPanelComponent {
  readonly avatars = input<ReadonlyMap<string, string>>(
    new Map(),
  );
  readonly canSend = input(false);
  readonly error = input<null | string>(null);
  readonly messages = input.required<ChatMessage[]>();
  readonly names = input.required<ReadonlyMap<string, string>>();
  readonly say = output<string>();
  protected readonly max = CHAT_MAX;
  private readonly list =
    viewChild.required<ElementRef<HTMLUListElement>>('list');

  constructor() {
    afterRenderEffect(() => {
      this.messages();
      const list = this.list().nativeElement;
      list.scrollTop = list.scrollHeight;
    });
  }

  protected name(id: string): string {
    return this.names().get(id) ?? 'Someone';
  }

  protected submit(event: Event, box: HTMLInputElement): void {
    event.preventDefault();
    const text = box.value.trim();
    if (!text) return;
    this.say.emit(text);
    box.value = '';
  }
}
