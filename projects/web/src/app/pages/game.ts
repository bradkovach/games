import type { PlayerView } from 'engine';

import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  type OnInit,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { ActionPanelComponent } from '../components/action-panel';
import { BoardComponent } from '../components/board';
import { ChatPanelComponent } from '../components/chat-panel';
import { InfoTableComponent } from '../components/info-table';
import { LogPanelComponent } from '../components/log-panel';
import { PanelComponent } from '../components/panel';
import { PreferencesPanelComponent } from '../components/preferences-panel';
import { ResultsPanelComponent } from '../components/results-panel';
import { StatusBarComponent } from '../components/status-bar';
import { tileHints } from '../components/tile-hints';
import { GameClient } from '../services/game-client';
import { PreferencesService } from '../services/preferences';
import { loadSeat } from '../services/seats';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ActionPanelComponent,
    BoardComponent,
    ChatPanelComponent,
    InfoTableComponent,
    LogPanelComponent,
    PanelComponent,
    PreferencesPanelComponent,
    ResultsPanelComponent,
    RouterLink,
    StatusBarComponent,
  ],
  providers: [GameClient],
  selector: 'app-game',
  styleUrls: ['./frame.css'],
  template: `
    @if (!hasSeat) {
      <section class="panel page">
        <p>You don't have a seat in this game.</p>
        <a [routerLink]="['/game', id(), 'watch']"
          >Watch the board instead</a
        >
      </section>
    } @else if (client.lobby()?.started) {
      @if (view(); as view) {
        <div
          class="frame"
          [class.my-turn]="myTurn()"
          [class.no-board]="prefs.hideBoard()"
        >
          @if (!prefs.hideBoard()) {
            <div class="board-area">
              <app-board
                [board]="view.board"
                [hand]="handTiles()"
                [hints]="hints()"
                [selectable]="selectable()"
                (tileClick)="
                  client.send({
                    tile: $event,
                    type: 'placeTile',
                  })
                "
              />
            </div>
          }
          <app-status-bar
            class="status"
            [name]="myName()"
            [avatar]="client.avatars().get(view.me.id)"
            [cash]="view.me.cash"
            [hand]="view.me.hand"
            [bagCount]="view.bagCount"
            [cue]="turnCue()"
            [turn]="myTurn()"
          >
            <a
              [routerLink]="['/game', id(), 'watch']"
              target="_blank"
              >Board view</a
            >
          </app-status-bar>
          <aside class="side">
            <section
              #actions
              class="panel actions"
              [class.attention]="myTurn()"
              [attr.aria-label]="myTurn() ? 'Your turn' : null"
            >
              @if (view.results; as results) {
                <h3>Final standings</h3>
                <app-results-panel
                  [results]="results"
                  [name]="nameOf"
                />
              } @else {
                <app-action-panel />
              }
            </section>
            <div class="scroll">
              <section class="panel">
                <app-info-table
                  [chains]="view.chains"
                  [players]="view.players"
                  [gameMode]="gameMode()"
                  [active]="activePlayer()"
                  [avatars]="client.avatars()"
                  [you]="client.you()"
                  [me]="view.me"
                />
              </section>
              <app-panel key="log" heading="Log">
                <app-log-panel
                  [events]="client.log()"
                  [names]="client.names()"
                />
              </app-panel>
              <app-panel key="chat" heading="Table talk">
                <app-chat-panel
                  [messages]="client.chat()"
                  [names]="client.names()"
                  [avatars]="client.avatars()"
                  [canSend]="client.you() !== null"
                  [error]="client.chatError()"
                  (say)="client.say($event)"
                />
              </app-panel>
              <app-panel key="prefs" heading="Preferences">
                <app-preferences-panel [player]="true" />
              </app-panel>
            </div>
          </aside>
        </div>
      }
    } @else if (client.error(); as error) {
      <p class="error page">{{ error }}</p>
    } @else {
      <p class="muted page">Connecting…</p>
    }
  `,
})
export class GamePage implements OnInit {
  readonly id = input.required<string>();
  protected readonly client = inject(GameClient);
  protected readonly activePlayer = computed(() => {
    // this.client.view()?.settings.mode
    const phase = this.client.view()?.phase;
    return phase && 'playerId' in phase ? phase.playerId : null;
  });
  protected readonly gameMode = computed(
    () => this.client.view()?.settings.mode || 'classic',
  );
  protected readonly view = computed(() => {
    const view = this.client.view();
    return view && 'me' in view ? (view as PlayerView) : null;
  });
  protected readonly handTiles = computed(() =>
    (this.view()?.me.hand ?? []).map((t) => t.tile),
  );
  protected hasSeat = true;
  protected readonly hints = computed(() =>
    tileHints(this.view()?.me.hand ?? []),
  );
  protected readonly myName = computed(
    () =>
      this.client.names().get(this.client.you() ?? '') ?? 'You',
  );
  /** True whenever this player owes the table a decision. */
  protected readonly myTurn = computed(() => {
    const view = this.view();
    if (!view) return false;
    const { phase } = view;
    return 'playerId' in phase && phase.playerId === view.me.id;
  });
  protected readonly prefs = inject(PreferencesService);
  protected readonly selectable = computed(() => {
    const view = this.view();
    if (!view) return [];
    const { phase } = view;
    if (
      phase.kind !== 'placeTile' ||
      phase.playerId !== view.me.id
    )
      return [];
    return view.me.hand
      .filter((t) => t.status === 'playable')
      .map((t) => t.tile);
  });
  protected readonly turnCue = computed(() => {
    if (this.view()?.results) return 'Game over';
    if (this.myTurn()) return 'Your turn';
    const active = this.activePlayer();
    const name = active && this.client.names().get(active);
    return name ? `Waiting for ${name}` : null;
  });
  private readonly actions =
    viewChild<ElementRef<HTMLElement>>('actions');
  /** Changes with each decision this player is asked to make. */
  private readonly decision = computed(() => {
    const view = this.view();
    if (!view || !this.myTurn()) return null;
    return `${view.phase.kind}:${this.client.log().length}`;
  });
  private readonly injector = inject(Injector);
  private readonly router = inject(Router);

  constructor() {
    // Seats are only playable once the host starts; wait in the lobby.
    effect(() => {
      const lobby = this.client.lobby();
      if (lobby && !lobby.started) {
        void this.router.navigate(['/game', this.id()], {
          replaceUrl: true,
        });
      }
    });
    // Small screens scroll the actions away; bring them back once
    // the panel has rendered the new decision.
    effect(() => {
      if (!this.decision()) return;
      afterNextRender(() => this.revealActions(), {
        injector: this.injector,
      });
    });
  }

  ngOnInit(): void {
    this.hasSeat = loadSeat(this.id()) !== null;
    if (this.hasSeat) this.client.connect(this.id());
  }

  protected readonly nameOf = (id: string) =>
    this.client.names().get(id) ?? id;

  /** Scrolls the side column so the action panel's top shows. */
  private revealActions(): void {
    const panel = this.actions()?.nativeElement;
    const scroller = panel?.closest<HTMLElement>('.side');
    if (!panel || !scroller?.scrollTo) return;
    if (scroller.scrollHeight <= scroller.clientHeight) return;
    const offset =
      panel.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top;
    if (Math.abs(offset) < 2) return;
    const still =
      globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')
        .matches ?? true;
    scroller.scrollTo({
      behavior: still ? 'auto' : 'smooth',
      top: scroller.scrollTop + offset,
    });
  }
}
