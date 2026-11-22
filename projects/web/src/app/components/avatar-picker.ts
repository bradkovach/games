import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
} from '@angular/core';

import { avatarEmoji, AVATARS } from '../../shared/avatars';

/** Radio-style grid of mascot emoji; taken ones are disabled. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-avatar-picker',
  styles: `
    .grid {
      display: grid;
      gap: 0.25rem;
      grid-template-columns: repeat(
        auto-fill,
        minmax(2.5rem, 1fr)
      );
      max-width: 24rem;
    }
    button {
      aspect-ratio: 1;
      background: var(--neutral);
      border: 2px solid transparent;
      color: var(--ink);
      font-size: 1.35rem;
      line-height: 1;
      padding: 0;
    }
    button:hover:not(:disabled) {
      background: var(--neutral-hover);
    }
    button[aria-checked='true'] {
      border-color: var(--accent);
    }
    button:disabled {
      opacity: 0.25;
    }
  `,
  template: `
    <div
      class="grid"
      role="radiogroup"
      [attr.aria-label]="label()"
    >
      @for (a of options(); track a.glyph) {
        <button
          type="button"
          role="radio"
          class="emoji"
          [attr.aria-checked]="a.glyph === value()"
          [attr.aria-label]="a.name"
          [disabled]="a.taken"
          [title]="a.taken ? a.name + ' (taken)' : a.name"
          (click)="value.set(a.glyph)"
        >
          {{ a.text }}
        </button>
      }
    </div>
  `,
})
export class AvatarPickerComponent {
  readonly label = input('Choose your mascot');
  readonly taken = input<readonly string[]>([]);
  readonly value = model<null | string>(null);
  protected readonly options = computed(() => {
    const taken = new Set(this.taken());
    return AVATARS.map((a) => ({
      ...a,
      taken: taken.has(a.glyph) && a.glyph !== this.value(),
      text: avatarEmoji(a.glyph),
    }));
  });
}
