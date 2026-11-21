import type { GameEvent } from 'engine';

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

import { describeEvent } from './describe';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-log-panel',
  styles: `
    ol {
      display: flex;
      flex-direction: column-reverse;
      font-size: 0.9rem;
      margin: 0;
      max-height: 18rem;
      overflow-y: auto;
      padding-left: 2rem;
    }
  `,
  template: `
    <ol>
      @for (line of lines(); track $index) {
        <li>{{ line }}</li>
      }
    </ol>
  `,
})
export class LogPanelComponent {
  readonly events = input.required<GameEvent[]>();
  readonly names = input.required<ReadonlyMap<string, string>>();

  protected readonly lines = computed(() =>
    this.events()
      .map((e) => describeEvent(e, this.names()))
      .filter((line): line is string => line !== null)
      .reverse(),
  );
}
