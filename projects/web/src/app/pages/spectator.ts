import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  type OnInit,
} from '@angular/core';

import { BoardComponent } from '../components/board';
import { ChainTableComponent } from '../components/chain-table';
import { LogPanelComponent } from '../components/log-panel';
import { PlayersPanelComponent } from '../components/players-panel';
import { ResultsPanelComponent } from '../components/results-panel';
import { GameClient } from '../services/game-client';

/** Public board for a shared screen; never receives private data. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BoardComponent,
    ChainTableComponent,
    LogPanelComponent,
    PlayersPanelComponent,
    ResultsPanelComponent,
  ],
  providers: [GameClient],
  selector: 'app-spectator',
  template: `
    @if (client.view(); as view) {
      <div class="grid-2">
        <section class="panel">
          <app-board
            [board]="view.board"
            [lastTile]="lastTile()"
          />
          <p class="muted">
            {{ view.bagCount }} tiles left in the bag
          </p>
        </section>
        <div>
          @if (view.results; as results) {
            <section class="panel">
              <h3>Final standings</h3>
              <app-results-panel
                [results]="results"
                [name]="nameOf"
              />
            </section>
          }
          <section class="panel">
            <app-chain-table [chains]="view.chains" />
          </section>
          <section class="panel">
            <app-players-panel
              [gameMode]="view.settings.mode"
              [players]="view.players"
              [active]="activePlayer()"
            />
          </section>
          <section class="panel">
            <app-log-panel
              [events]="client.log()"
              [names]="client.names()"
            />
          </section>
        </div>
      </div>
    } @else if (client.lobby(); as lobby) {
      <section class="panel">
        <h2>Waiting for the game to start</h2>
        <p>{{ lobby.players.length }} player(s) seated.</p>
      </section>
    } @else if (client.error(); as error) {
      <p class="error">{{ error }}</p>
    } @else {
      <p class="muted">Connecting…</p>
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
