import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';

/** [−] value [+] control sized for touch screens. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-stepper',
  styles: `
    :host {
      display: flex;
      min-width: 7rem;
    }
    button {
      align-items: center;
      background: var(--neutral);
      border: none;
      border-radius: 0;
      color: var(--ink);
      display: flex;
      justify-content: center;
      padding: 0.3rem 0.5rem;
      &:hover:not(:disabled) {
        background: var(--neutral-hover);
      }
    }
    .value + button {
      border-left: 1px solid var(--line);
    }
    .value {
      align-items: center;
      display: flex;
      flex: 1;
      font-variant-numeric: tabular-nums;
      justify-content: center;
    }
  `,
  template: `
    <button
      type="button"
      class="actions__action"
      [attr.aria-label]="decrementLabel()"
      [disabled]="!canDecrement()"
      (click)="decrement.emit()"
    >
      −
    </button>
    <span class="value">{{ text() ?? value() }}</span>
    <button
      type="button"
      class="actions__action"
      [attr.aria-label]="incrementLabel()"
      [disabled]="!canIncrement()"
      (click)="increment.emit()"
    >
      +
    </button>
  `,
})
export class StepperComponent {
  readonly canDecrement = input(true);
  readonly canIncrement = input(true);
  readonly decrement = output();
  readonly decrementLabel = input<null | string>(null);
  readonly increment = output();
  readonly incrementLabel = input<null | string>(null);
  /** Shown instead of the value, e.g. "-" for zero. */
  readonly text = input<null | string>(null);
  readonly value = input.required<number>();
}
