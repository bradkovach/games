import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
} from '@angular/core';

export type TickerFormat = 'currency' | 'number';

interface Tick {
  direction: 'down' | 'up' | null;
  /** Bumped on every change so the flash animation restarts. */
  key: number;
  previous: null | number;
}

const NUMBER = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
});

/**
 * Inline number that flashes green ▲ or red ▼ like a stock ticker
 * whenever its value changes. The arrow is absolutely positioned
 * so the surrounding layout never shifts.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.title]': 'title()',
    '[class.down]': "tick().direction === 'down'",
    '[class.up]': "tick().direction === 'up'",
  },
  selector: 'app-ticker',
  styles: `
    :host {
      display: inline-block;
      font-variant-numeric: tabular-nums;
      position: relative;
      white-space: nowrap;
    }
    .value {
      border-radius: 3px;
      display: inline-block;
      padding: 0 0.15em;
    }
    .arrow {
      font-size: 0.65em;
      opacity: 0;
      pointer-events: none;
      position: absolute;
      right: 100%;
      top: 50%;
      translate: 0 -50%;
    }
    :host(.up) .arrow {
      color: var(--up);
    }
    :host(.down) .arrow {
      color: var(--down);
    }
    :host(.up) .value {
      --tick: var(--up);
    }
    :host(.down) .value {
      --tick: var(--down);
    }
    :host(.up) .value,
    :host(.down) .value {
      animation: tick-flash 1.6s ease-out;
    }
    :host(.up) .arrow,
    :host(.down) .arrow {
      animation: tick-arrow 2.4s ease-out;
    }
    @keyframes tick-flash {
      from {
        background: color-mix(
          in srgb,
          var(--tick) 30%,
          transparent
        );
        color: var(--tick);
      }
    }
    @keyframes tick-arrow {
      from,
      60% {
        opacity: 1;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      :host(.up) .value,
      :host(.down) .value,
      :host(.up) .arrow,
      :host(.down) .arrow {
        animation-duration: 0.01s;
      }
    }
  `,
  template: `
    @for (key of [tick().key]; track key) {
      @if (tick().direction; as direction) {
        <span class="arrow" aria-hidden="true">{{
          direction === 'down' ? '▼' : '▲'
        }}</span>
      }
      <span class="value">{{ text() }}</span>
    }
  `,
})
export class TickerComponent {
  readonly format = input<TickerFormat>('number');
  readonly value = input.required<number>();
  protected readonly text = computed(() =>
    formatTicker(this.value(), this.format()),
  );
  protected readonly tick = linkedSignal<number, Tick>({
    computation: (value, previous) => {
      if (!previous) {
        return { direction: null, key: 0, previous: null };
      }
      const before = previous.source;
      return {
        direction: value > before ? 'up' : 'down',
        key: previous.value.key + 1,
        previous: before,
      };
    },
    source: this.value,
  });
  protected readonly title = computed(() => {
    const { previous } = this.tick();
    return previous === null
      ? null
      : `Was ${formatTicker(previous, this.format())}`;
  });
}

export function formatTicker(
  value: number,
  format: TickerFormat,
): string {
  const text = NUMBER.format(Math.abs(value));
  const sign = value < 0 ? '−' : '';
  return format === 'currency'
    ? `${sign}$${text}`
    : `${sign}${text}`;
}
