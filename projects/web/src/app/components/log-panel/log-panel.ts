import type { GameEvent } from 'engine';

import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  type ElementRef,
  input,
  viewChild,
} from '@angular/core';

import { describeEvent } from '../../../shared/describe';

/** Pixels from the bottom that still count as "following". */
const STICK_THRESHOLD = 24;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-log-panel',
  styles: `
    ol {
      font-size: 0.9rem;
      margin: 0;
      max-height: 18rem;
      overflow-y: auto;
      padding-left: 2.5rem;
    }
  `,
  template: `
    <ol #list (scroll)="onScroll()">
      @for (line of lines(); track $index) {
        <li>{{ line }}</li>
      }
    </ol>
  `,
})
export class LogPanelComponent {
  readonly events = input.required<GameEvent[]>();
  readonly names = input.required<ReadonlyMap<string, string>>();
  /** Oldest first, so the newest line is at the bottom. */
  protected readonly lines = computed(() =>
    this.events()
      .map((e) => describeEvent(e, this.names()))
      .filter((line): line is string => line !== null),
  );
  private following = true;
  private readonly list =
    viewChild.required<ElementRef<HTMLOListElement>>('list');

  constructor() {
    // Keep the newest line in view unless the reader scrolled up.
    afterRenderEffect(() => {
      this.lines();
      const list = this.list().nativeElement;
      if (this.following) list.scrollTop = list.scrollHeight;
    });
  }

  protected onScroll(): void {
    const list = this.list().nativeElement;
    this.following =
      list.scrollHeight - list.scrollTop - list.clientHeight <=
      STICK_THRESHOLD;
  }
}
