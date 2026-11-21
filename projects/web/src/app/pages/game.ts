import type { PlayerView } from 'engine';

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  type OnInit,
  signal,
} from '@angular/core';
import {
  DomSanitizer,
  type SafeUrl,
} from '@angular/platform-browser';
import { RouterLink } from '@angular/router';

import type { InviteInfo } from '../../shared/protocol';

import { ActionPanelComponent } from '../components/action-panel';
import { BoardComponent } from '../components/board';
import { ChainTableComponent } from '../components/chain-table';
import { LogPanelComponent } from '../components/log-panel';
import { PlayersPanelComponent } from '../components/players-panel';
import { ResultsPanelComponent } from '../components/results-panel';
import { Api } from '../services/api';
import { GameClient } from '../services/game-client';
import { loadSeat } from '../services/seats';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ActionPanelComponent,
    BoardComponent,
    ChainTableComponent,
    LogPanelComponent,
    PlayersPanelComponent,
    ResultsPanelComponent,
    RouterLink,
  ],
  providers: [GameClient],
  selector: 'app-game',
  styles: `
    .hand button {
      font-weight: 700;
      min-width: 3rem;
    }
    .hand button.dead {
      background: var(--danger);
    }
    .hand button.unplayable {
      background: var(--muted);
    }
    .qr {
      max-width: 220px;
      width: 100%;
    }
  `,
  template: `
    @if (!hasSeat) {
      <section class="panel">
        <p>You don't have a seat in this game.</p>
        <a [routerLink]="['/game', id(), 'board']"
          >Watch the board instead</a
        >
      </section>
    } @else if (client.lobby(); as lobby) {
      @if (!lobby.started) {
        <section class="panel">
          <h2>Lobby</h2>
          <p class="muted">
            {{
              lobby.settings.mode === 'tycoon'
                ? 'Tycoon'
                : 'Classic'
            }}
            mode
            {{
              lobby.settings.secretHoldings
                ? '· secret holdings'
                : ''
            }}
          </p>
          <ol>
            @for (p of lobby.players; track p.id) {
              <li>
                {{ p.name }}
                {{ p.id === lobby.hostPlayerId ? '(host)' : '' }}
              </li>
            }
          </ol>
          @if (isHost()) {
            <div class="row">
              <button
                type="button"
                class="secondary"
                (click)="invite()"
              >
                {{
                  inviteInfo() ? 'New invite' : 'Invite players'
                }}
              </button>
              <button
                type="button"
                [disabled]="lobby.players.length < 2"
                (click)="client.start()"
              >
                Start game
              </button>
            </div>
            @if (inviteInfo(); as info) {
              <div
                class="row"
                style="margin-top: 1rem; align-items: flex-start"
              >
                <img
                  class="qr"
                  alt="Invite QR code"
                  [src]="qr()"
                />
                <div>
                  <p>
                    PIN:
                    <strong style="font-size: 1.5rem">{{
                      info.pin
                    }}</strong>
                  </p>
                  <p class="muted">
                    Expires at {{ expires(info.expiresAt) }}
                  </p>
                  <p><a [href]="info.url">Invite link</a></p>
                </div>
              </div>
            }
            @if (inviteError()) {
              <p class="error">{{ inviteError() }}</p>
            }
          } @else {
            <p class="muted">Waiting for the host to start…</p>
          }
        </section>
      } @else if (view(); as view) {
        <div class="grid-2">
          <div>
            <section class="panel">
              <app-board
                [board]="view.board"
                [hand]="handTiles()"
                [selectable]="selectable()"
                (tileClick)="
                  client.send({
                    tile: $event,
                    type: 'placeTile',
                  })
                "
              />
            </section>
            <section class="panel">
              <h3>Your tiles · \${{ view.me.cash }}</h3>
              <div class="row hand">
                @for (t of view.me.hand; track t.tile) {
                  <button
                    type="button"
                    [class]="t.status"
                    [title]="t.status"
                    [disabled]="!selectable().includes(t.tile)"
                    (click)="
                      client.send({
                        tile: t.tile,
                        type: 'placeTile',
                      })
                    "
                  >
                    {{ t.tile }}
                  </button>
                }
              </div>
              <p class="muted">
                {{ view.bagCount }} tiles left in the bag.
                <a
                  [routerLink]="['/game', id(), 'board']"
                  target="_blank"
                  >Open board view</a
                >
              </p>
            </section>
          </div>
          <div>
            <section class="panel">
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
            <section class="panel">
              <app-chain-table
                [chains]="view.chains"
                [mine]="view.me.stock"
              />
            </section>
            <section class="panel">
              <app-players-panel
                [gameMode]="gameMode()"
                [players]="view.players"
                [active]="activePlayer()"
                [you]="client.you()"
              />
            </section>
            <section class="panel">
              <h3>Log</h3>
              <app-log-panel
                [events]="client.log()"
                [names]="client.names()"
              />
            </section>
          </div>
        </div>
      }
    } @else if (client.error(); as error) {
      <p class="error">{{ error }}</p>
    } @else {
      <p class="muted">Connecting…</p>
    }
  `,
})
export class GamePage implements OnInit {
  readonly id = input.required<string>();
  protected readonly client = inject(GameClient);
  protected readonly gameMode = computed(
    () => this.client.view()?.settings.mode || 'classic',
  );
  protected readonly activePlayer = computed(() => {
    // this.client.view()?.settings.mode
    const phase = this.client.view()?.phase;
    return phase && 'playerId' in phase ? phase.playerId : null;
  });
  protected readonly view = computed(() => {
    const view = this.client.view();
    return view && 'me' in view ? (view as PlayerView) : null;
  });
  protected readonly handTiles = computed(() =>
    (this.view()?.me.hand ?? []).map((t) => t.tile),
  );
  protected hasSeat = true;
  protected readonly inviteError = signal<null | string>(null);
  protected readonly inviteInfo = signal<InviteInfo | null>(
    null,
  );
  protected readonly isHost = computed(
    () =>
      this.client.lobby()?.hostPlayerId === this.client.you() ||
      this.client.lobby()?.hostPlayerId ===
        loadSeat(this.id())?.playerId,
  );
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly qr = computed<null | SafeUrl>(() => {
    const info = this.inviteInfo();
    // Server-generated SVG, rendered as an image so it cannot run script.
    return info
      ? this.sanitizer.bypassSecurityTrustUrl(
          `data:image/svg+xml;utf8,${encodeURIComponent(info.qrSvg)}`,
        )
      : null;
  });
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
  private readonly api = inject(Api);

  ngOnInit(): void {
    this.hasSeat = loadSeat(this.id()) !== null;
    if (this.hasSeat) this.client.connect(this.id());
  }

  protected expires(at: number): string {
    return new Date(at).toLocaleTimeString();
  }

  protected async invite(): Promise<void> {
    try {
      this.inviteError.set(null);
      this.inviteInfo.set(await this.api.invite(this.id()));
    } catch (error) {
      this.inviteError.set(
        `${(error as Error).message}. Sign in as the host to invite.`,
      );
    }
  }

  protected readonly nameOf = (id: string) =>
    this.client.names().get(id) ?? id;
}
