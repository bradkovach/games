import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
} from '@angular/core';
import { CHAIN_NAMES, type ChainId } from 'engine';

import { GameClient } from '../../../services/game-client';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-choose-acquired',
  template: `
    <h3>Choose which chain is acquired next</h3>
    <div class="row">
      @for (c of candidates(); track c) {
        <button
          type="button"
          class="chip chain-{{ c }}"
          (click)="
            client.send({ chain: c, type: 'chooseAcquired' })
          "
        >
          {{ names[c] }}
        </button>
      }
    </div>
  `,
})
export class ChooseAcquiredComponent {
  readonly candidates = input.required<readonly ChainId[]>();
  protected readonly client = inject(GameClient);
  protected readonly names = CHAIN_NAMES;
}
