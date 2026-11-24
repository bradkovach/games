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
  selector: 'app-choose-survivor',
  template: `
    <h3>Choose the surviving chain</h3>
    <div class="row">
      @for (c of candidates(); track c) {
        <button
          type="button"
          class="chip chain-{{ c }}"
          (click)="
            client.send({ chain: c, type: 'chooseSurvivor' })
          "
        >
          {{ names[c] }}
        </button>
      }
    </div>
  `,
})
export class ChooseSurvivorComponent {
  readonly candidates = input.required<readonly ChainId[]>();
  protected readonly client = inject(GameClient);
  protected readonly names = CHAIN_NAMES;
}
