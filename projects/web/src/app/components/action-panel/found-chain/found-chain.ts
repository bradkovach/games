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
  selector: 'app-found-chain',
  template: `
    <h3>Found a new chain</h3>
    <div class="row">
      @for (c of available(); track c) {
        <button
          type="button"
          class="chip chain-{{ c }}"
          (click)="client.send({ chain: c, type: 'foundChain' })"
        >
          {{ names[c] }}
        </button>
      }
    </div>
  `,
})
export class FoundChainComponent {
  readonly available = input.required<readonly ChainId[]>();
  protected readonly client = inject(GameClient);
  protected readonly names = CHAIN_NAMES;
}
