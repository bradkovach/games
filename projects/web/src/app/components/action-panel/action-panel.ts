import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { type PlayerView } from 'engine';

import { GameClient } from '../../services/game-client';
import { PreferencesService } from '../../services/preferences';
import { BuyStockComponent } from './buy-stock/buy-stock';
import { ChooseAcquiredComponent } from './choose-acquired/choose-acquired';
import { ChooseSurvivorComponent } from './choose-survivor/choose-survivor';
import { DisposeStockComponent } from './dispose-stock/dispose-stock';
import { FoundChainComponent } from './found-chain/found-chain';
import { PlaceTileComponent } from './place-tile/place-tile';

/** Time to cancel before an automatic end of turn. */
export const AUTO_END_DELAY_MS = 1500;

/**
 * Shell for the player's decisions: shows the component for the
 * current phase and handles waiting and auto-end.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BuyStockComponent,
    ChooseAcquiredComponent,
    ChooseSurvivorComponent,
    DisposeStockComponent,
    FoundChainComponent,
    PlaceTileComponent,
  ],
  selector: 'app-action-panel',
  styles: `
    .auto-end {
      align-items: center;
      display: flex;
      gap: 0.5rem;
    }
  `,
  template: `
    @if (view(); as view) {
      <!-- Re-creating the child resets its local inputs. -->
      @for (key of [decisionKey()]; track key) {
        @switch (myPhase()?.kind) {
          @case ('placeTile') {
            <app-place-tile [view]="view" />
          }
          @case ('foundChain') {
            <app-found-chain [available]="available()" />
          }
          @case ('chooseSurvivor') {
            <app-choose-survivor [candidates]="candidates()" />
          }
          @case ('chooseAcquired') {
            <app-choose-acquired [candidates]="candidates()" />
          }
          @case ('disposeStock') {
            @if (disposing(); as d) {
              <app-dispose-stock
                [acquired]="d.acquired"
                [survivor]="d.survivor"
                [view]="view"
              />
            }
          }
          @case ('buyStock') {
            <app-buy-stock [view]="view" />
          }
          @default {
            @if (view.phase.kind === 'gameOver') {
              <h3>Game over</h3>
            } @else if (waitingOn(); as who) {
              <p class="muted">
                Waiting for
                @if (who.avatar) {
                  <span class="emoji" aria-hidden="true">{{
                    who.avatar
                  }}</span>
                }
                {{ who.name }}…
              </p>
            }
          }
        }
      }
      @if (autoEndPending()) {
        <p class="auto-end" role="status">
          Nothing to do — ending your turn…
          <button
            type="button"
            class="secondary"
            (click)="cancelAutoEnd()"
          >
            Cancel
          </button>
        </p>
      }
      @if (autoEndHeld()) {
        <p class="auto-end held" role="status">
          You have no other moves, but your turn wasn't ended
          automatically because
          {{
            view.endDeclared
              ? 'ending it finishes the game.'
              : 'you can declare the game over.'
          }}
        </p>
      }
      @if (client.error(); as error) {
        <p class="error">{{ error }}</p>
      }
    }
  `,
})
export class ActionPanelComponent {
  protected readonly client = inject(GameClient);

  protected readonly view = computed(() => {
    const view = this.client.view();
    return view && 'me' in view ? (view as PlayerView) : null;
  });
  protected readonly hasPlayable = computed(() =>
    (this.view()?.me.hand ?? []).some(
      (t) => t.status === 'playable',
    ),
  );
  protected readonly myPhase = computed(() => {
    const view = this.view();
    if (!view) return null;
    const { phase } = view;
    return 'playerId' in phase && phase.playerId === view.me.id
      ? phase
      : null;
  });
  /**
   * The only move left: skipping placement with no playable tile,
   * or ending the turn when no share is affordable.
   */
  protected readonly forcedAction = computed(
    (): 'endTurn' | 'passPlacement' | null => {
      const view = this.view();
      const phase = this.myPhase();
      if (!view || !phase) return null;
      if (phase.kind === 'placeTile' && !this.hasPlayable()) {
        return 'passPlacement';
      }
      if (
        phase.kind === 'buyStock' &&
        !view.chains.some(
          (c) =>
            c.active && c.bank > 0 && c.price <= view.me.cash,
        )
      ) {
        return 'endTurn';
      }
      return null;
    },
  );
  protected readonly prefs = inject(PreferencesService);
  /**
   * Auto-end never fires while declaring the end is possible, so
   * the player keeps the choice to finish the game.
   */
  protected readonly autoEndHeld = computed(() => {
    const view = this.view();
    return (
      this.prefs.autoEndTurn() &&
      !!this.forcedAction() &&
      !!view &&
      (view.canDeclareEnd || view.endDeclared)
    );
  });
  protected readonly autoAction = computed(() =>
    this.prefs.autoEndTurn() && !this.autoEndHeld()
      ? this.forcedAction()
      : null,
  );
  protected readonly autoEndPending = signal(false);
  protected readonly available = computed(() =>
    (this.view()?.chains ?? [])
      .filter((c) => !c.active)
      .map((c) => c.chain),
  );

  protected readonly candidates = computed(() => {
    const phase = this.myPhase();
    return phase && 'candidates' in phase
      ? phase.candidates
      : [];
  });
  /**
   * Identifies the decision being made. Every server message builds
   * a new phase object, so the inputs reset on this string instead.
   */
  protected readonly decisionKey = computed(() => {
    const phase = this.myPhase();
    if (!phase) return '';
    return 'acquired' in phase
      ? `${phase.kind}:${phase.acquired}`
      : phase.kind;
  });
  protected readonly disposing = computed(() => {
    const phase = this.myPhase();
    return phase?.kind === 'disposeStock'
      ? { acquired: phase.acquired, survivor: phase.survivor }
      : null;
  });
  protected readonly waitingOn = computed(() => {
    const phase = this.client.view()?.phase;
    if (!phase || !('playerId' in phase)) return null;
    return {
      avatar: this.client.avatars().get(phase.playerId),
      name:
        this.client.names().get(phase.playerId) ??
        'another player',
    };
  });

  /** Decision for which the player cancelled auto-end. */
  private readonly autoEndCancelled = signal<null | string>(
    null,
  );

  constructor() {
    effect(() => {
      this.decisionKey();
      this.autoEndCancelled.set(null);
    });

    effect((onCleanup) => {
      const action = this.autoAction();
      const key = this.decisionKey();
      if (!action || this.autoEndCancelled() === key) {
        this.autoEndPending.set(false);
        return;
      }
      this.autoEndPending.set(true);
      const timer = setTimeout(() => {
        this.autoEndPending.set(false);
        // Nothing is affordable, so there are no purchases.
        if (action === 'endTurn') {
          this.client.send({
            type: 'endTurn',
            discardDead: true,
            purchases: {},
          });
        } else this.client.send({ type: 'passPlacement' });
      }, AUTO_END_DELAY_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }

  protected cancelAutoEnd(): void {
    this.autoEndCancelled.set(this.decisionKey());
  }
}
