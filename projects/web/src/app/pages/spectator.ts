import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  type OnInit,
} from '@angular/core';

import { BoardComponent } from '../components/board';
import { ChatPanelComponent } from '../components/chat-panel';
import { InfoTableComponent } from '../components/info-table';
import { LogPanelComponent } from '../components/log-panel';
import { ResultsPanelComponent } from '../components/results-panel';
import { StatusBarComponent } from '../components/status-bar';
import { GameClient } from '../services/game-client';

/** Public board for a shared screen; never receives private data. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BoardComponent,
    ChatPanelComponent,
    InfoTableComponent,
    LogPanelComponent,
    ResultsPanelComponent,
    StatusBarComponent,
  ],
  providers: [GameClient],
  selector: 'app-spectator',
  styleUrl: './frame.css',
  template: `
    @if (client.view(); as view) {
      <div class="frame">
        <div class="board-area">
          <app-board
            [board]="view.board"
            [lastTile]="lastTile()"
          />
        </div>
        <app-status-bar
          class="status"
          [name]="activeName()"
          [avatar]="client.avatars().get(activePlayer() ?? '')"
          [cue]="view.results ? 'Game over' : 'to play'"
          [bagCount]="view.bagCount"
        />
        <aside class="side">
          @if (view.results; as results) {
            <section class="panel actions">
              <h3>Final standings</h3>
              <app-results-panel
                [results]="results"
                [name]="nameOf"
              />
            </section>
          }
          <div class="scroll">
            <section class="panel">
              <app-info-table
                [chains]="view.chains"
                [players]="view.players"
                [gameMode]="view.settings.mode"
                [active]="activePlayer()"
                [avatars]="client.avatars()"
              />
            </section>
            <section class="panel">
              <h3>Log</h3>
              <app-log-panel
                [events]="client.log()"
                [names]="client.names()"
              />
            </section>
            @if (client.chat().length > 0) {
              <section class="panel">
                <h3>Table talk</h3>
                <app-chat-panel
                  [messages]="client.chat()"
                  [names]="client.names()"
                  [avatars]="client.avatars()"
                />
              </section>
            }
          </div>
        </aside>
      </div>
    } @else if (client.lobby(); as lobby) {
      <section class="panel page">
        <h2>Waiting for the game to start</h2>
        <p>{{ lobby.players.length }} player(s) seated.</p>
      </section>
    } @else if (client.error(); as error) {
      <p class="error page">{{ error }}</p>
    } @else {
      <p class="muted page">Connecting…</p>
    }
  `,
})
export class SpectatorPage implements OnInit {
  readonly id = input.required<string>();
  protected readonly client = inject(GameClient);
  protected readonly activePlayer = computed(() => {
    const phase = this.client.view()?.phase;
    return phase && 'playerId' in phase ? phase.playerId : null;
  });
  protected readonly activeName = computed(() => {
    const id = this.activePlayer();
    return (id && this.client.names().get(id)) ?? '—';
  });
  protected readonly lastTile = computed(() => {
    const placed = this.client
      .log()
      .filter((e) => e.type === 'tilePlaced');
    return placed.at(-1)?.tile ?? null;
  });
  ngOnInit(): void {
    this.client.connect(this.id(), true);
  }

  protected readonly nameOf = (id: string) =>
    this.client.names().get(id) ?? id;
}
