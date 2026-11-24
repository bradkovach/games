import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  type OnInit,
  signal,
} from '@angular/core';
import {
  DomSanitizer,
  type SafeUrl,
} from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';

import type { InviteInfo } from '../../shared/protocol';

import { AvatarPickerComponent } from '../components/avatar-picker';
import { ChatPanelComponent } from '../components/chat-panel/chat-panel';
import { Api } from '../services/api';
import { GameClient } from '../services/game-client';
import { clearSeat, saveSeat } from '../services/seats';

/** Renew invites this long before they expire. */
const INVITE_MARGIN_MS = 60_000;

/** Pre-game room: the host's invite screen and players' seats. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AvatarPickerComponent,
    ChatPanelComponent,
    RouterLink,
  ],
  providers: [GameClient],
  selector: 'app-lobby',
  styles: `
    .players {
      list-style: none;
      padding: 0;
    }
    .players li {
      padding: 0.2rem 0;
    }
    .avatar {
      display: inline-block;
      font-size: 1.4rem;
      width: 2rem;
    }
    .invite {
      text-align: center;
    }
    .pin {
      font-size: clamp(2rem, 8vw, 3.5rem);
      font-variant-numeric: tabular-nums;
      font-weight: 700;
      letter-spacing: 0.05em;
      margin: 0.25rem 0;
    }
    .qr {
      max-width: 260px;
      width: 100%;
    }
    form label {
      display: block;
      margin-bottom: 0.5rem;
    }
    details {
      margin: 0.75rem 0;
    }
  `,
  template: `
    @if (client.lobby(); as lobby) {
      <div class="grid-2">
        <div>
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
            @if (lobby.players.length === 0) {
              <p class="muted">Nobody has joined yet.</p>
            }
            <ol class="players" aria-label="Players">
              @for (p of lobby.players; track p.id) {
                <li>
                  <span
                    class="emoji avatar"
                    aria-hidden="true"
                    >{{ client.avatars().get(p.id) }}</span
                  >
                  {{ p.name }}
                  {{
                    p.id === lobby.hostPlayerId ? '(host)' : ''
                  }}
                  {{ p.id === client.you() ? '(you)' : '' }}
                </li>
              }
            </ol>
            @if (isHost()) {
              <div class="row">
                <button
                  type="button"
                  class="start"
                  [disabled]="lobby.players.length < 2 || busy()"
                  (click)="start()"
                >
                  Start game
                </button>
                <span class="muted">
                  {{
                    lobby.players.length < 2
                      ? 'Needs at least 2 players.'
                      : client.you()
                        ? 'You will play on this device.'
                        : 'This device will show the board.'
                  }}
                </span>
              </div>
              @if (startError(); as error) {
                <p class="error">{{ error }}</p>
              }
            } @else {
              <p class="muted">Waiting for the host to start…</p>
            }
          </section>

          @if (client.you()) {
            <section class="panel you">
              <h3>You</h3>
              <form (submit)="rename($event, nameInput.value)">
                <label
                  >Name
                  <input
                    #nameInput
                    name="name"
                    maxlength="40"
                    required
                    [value]="myName()"
                  />
                </label>
                <button
                  type="submit"
                  class="secondary"
                  [disabled]="client.pending()"
                >
                  Save name
                </button>
              </form>
              <details>
                <summary>Change your mascot</summary>
                <app-avatar-picker
                  [value]="myAvatar()"
                  [taken]="takenAvatars()"
                  (valueChange)="
                    $event &&
                      client.patchSeat({ avatar: $event })
                  "
                />
              </details>
              @if (client.error(); as error) {
                <p class="error">{{ error }}</p>
              }
              <button
                type="button"
                class="secondary leave"
                [disabled]="client.pending()"
                (click)="leave()"
              >
                Leave game
              </button>
            </section>
            <section class="panel">
              <h3>Table talk</h3>
              <app-chat-panel
                [messages]="client.chat()"
                [names]="client.names()"
                [avatars]="client.avatars()"
                [canSend]="true"
                [error]="client.chatError()"
                (say)="client.say($event)"
              />
            </section>
          } @else if (isHost() && !lobby.hostPlayerId) {
            <section class="panel seat">
              <h3>Join on this device</h3>
              <p class="muted">
                Play from this screen too, or skip this to use it
                as the shared board.
              </p>
              <form (submit)="takeSeat($event, seatName.value)">
                <label
                  >Your name
                  <input
                    #seatName
                    name="name"
                    maxlength="40"
                    required
                    [value]="hostName()"
                  />
                </label>
                <p>Your mascot</p>
                <app-avatar-picker
                  [(value)]="seatAvatar"
                  [taken]="takenAvatars()"
                />
                <p>
                  <button type="submit" [disabled]="busy()">
                    Join on this device
                  </button>
                </p>
              </form>
              @if (seatError(); as error) {
                <p class="error">{{ error }}</p>
              }
            </section>
          } @else if (isHost()) {
            <p class="muted">
              Your seat is on another device; this one will show
              the board.
            </p>
          } @else if (client.left()) {
            <section class="panel">
              <h3>You left the game</h3>
              <p>
                Ask the host for a new invite to rejoin, or
                <a routerLink="/">go home</a>.
              </p>
            </section>
          } @else {
            <p>
              <a [routerLink]="['/game', id(), 'watch']"
                >Watch the board</a
              >
            </p>
          }
        </div>

        @if (isHost()) {
          <section class="panel invite" aria-label="Invite">
            <h3>Join at {{ origin }}/join</h3>
            @if (invite(); as info) {
              <p class="muted">PIN</p>
              <p class="pin">{{ info.pin }}</p>
              <img
                class="qr"
                alt="Invite QR code"
                [src]="qr()"
              />
              <p>
                <a [href]="info.url">Invite link</a>
                <span class="muted">
                  · renews at {{ renewsAt() }}</span
                >
              </p>
            } @else if (inviteError(); as error) {
              <p class="error">{{ error }}</p>
            } @else {
              <p class="muted">Creating an invite…</p>
            }
          </section>
        }
      </div>
    } @else if (client.error(); as error) {
      <p class="error">{{ error }}</p>
    } @else {
      <p class="muted">Connecting…</p>
    }
  `,
})
export class LobbyPage implements OnInit {
  readonly id = input.required<string>();
  protected readonly busy = signal(false);
  protected readonly client = inject(GameClient);
  protected readonly hostName = signal('');
  protected readonly invite = signal<InviteInfo | null>(null);
  protected readonly inviteError = signal<null | string>(null);
  protected readonly isHost = signal(false);
  protected readonly myAvatar = computed(
    () =>
      this.client
        .lobby()
        ?.players.find((p) => p.id === this.client.you())
        ?.avatar ?? null,
  );
  protected readonly myName = computed(
    () => this.client.names().get(this.client.you() ?? '') ?? '',
  );
  protected readonly origin =
    typeof location === 'undefined' ? '' : location.host;
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly qr = computed<null | SafeUrl>(() => {
    const info = this.invite();
    // Server-generated SVG, rendered as an image so it cannot run script.
    return info
      ? this.sanitizer.bypassSecurityTrustUrl(
          `data:image/svg+xml;utf8,${encodeURIComponent(info.qrSvg)}`,
        )
      : null;
  });
  protected readonly renewsAt = computed(() => {
    const info = this.invite();
    return info
      ? new Date(
          info.expiresAt - INVITE_MARGIN_MS,
        ).toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit',
        })
      : '';
  });
  protected readonly seatAvatar = signal<null | string>(null);
  protected readonly seatError = signal<null | string>(null);
  protected readonly startError = signal<null | string>(null);
  protected readonly takenAvatars = computed(() =>
    (this.client.lobby()?.players ?? []).map((p) => p.avatar),
  );
  private readonly api = inject(Api);
  private readonly destroyRef = inject(DestroyRef);
  private renewTimer?: ReturnType<typeof setTimeout>;
  private readonly router = inject(Router);

  constructor() {
    effect(() => {
      if (!this.client.lobby()?.started) return;
      clearTimeout(this.renewTimer);
      void this.router.navigate(
        [
          '/game',
          this.id(),
          this.client.you() ? 'play' : 'watch',
        ],
        { replaceUrl: true },
      );
    });
    // A seat removed elsewhere leaves a dead token behind.
    effect(() => {
      if (this.client.error() !== 'Invalid seat') return;
      clearSeat(this.id());
      this.client.reconnect(true);
    });
    this.destroyRef.onDestroy(() =>
      clearTimeout(this.renewTimer),
    );
  }

  async ngOnInit(): Promise<void> {
    this.client.connect(this.id());
    const [status, me] = await Promise.all([
      this.api
        .hostStatus(this.id())
        .catch(() => ({ isHost: false })),
      this.api.me(),
    ]);
    this.hostName.set(me?.name ?? '');
    this.isHost.set(status.isHost);
    if (status.isHost) await this.renewInvite();
  }

  protected leave(): void {
    if (globalThis.confirm?.('Leave this game?') === false)
      return;
    this.client.leave();
  }

  protected rename(event: Event, name: string): void {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed && trimmed !== this.myName())
      this.client.patchSeat({ name: trimmed });
  }

  protected async start(): Promise<void> {
    this.busy.set(true);
    this.startError.set(null);
    try {
      await this.api.startGame(this.id());
    } catch (error) {
      this.startError.set((error as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  protected async takeSeat(
    event: Event,
    name: string,
  ): Promise<void> {
    event.preventDefault();
    this.busy.set(true);
    this.seatError.set(null);
    try {
      const grant = await this.api.seatHost(
        this.id(),
        name.trim(),
        this.seatAvatar() ?? undefined,
      );
      saveSeat(grant);
      this.client.reconnect();
    } catch (error) {
      this.seatError.set((error as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  /** Keeps a fresh invite on screen until the game starts. */
  private async renewInvite(): Promise<void> {
    if (this.client.lobby()?.started) return;
    try {
      const info = await this.api.invite(this.id());
      this.invite.set(info);
      this.inviteError.set(null);
      this.renewTimer = setTimeout(
        () => void this.renewInvite(),
        Math.max(
          5_000,
          info.expiresAt - Date.now() - INVITE_MARGIN_MS,
        ),
      );
    } catch (error) {
      this.inviteError.set((error as Error).message);
    }
  }
}
