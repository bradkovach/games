import type {
  CommandInput,
  GameEvent,
  PlayerView,
  PublicView,
} from 'engine';

import {
  computed,
  Injectable,
  type OnDestroy,
  signal,
} from '@angular/core';

import type {
  LobbyInfo,
  ServerMessage,
} from '../../shared/protocol';

import { avatarEmoji } from '../../shared/avatars';
import { loadSeat } from './seats';

const LOG_LIMIT = 300;

/** One live connection to a game, exposed as signals. */
@Injectable()
export class GameClient implements OnDestroy {
  readonly lobby = signal<LobbyInfo | null>(null);
  /** Player id → avatar glyph, ready to render as text. */
  readonly avatars = computed(() => {
    const map = new Map<string, string>();
    for (const p of this.lobby()?.players ?? []) {
      if (p.avatar) map.set(p.id, avatarEmoji(p.avatar));
    }
    return map;
  });
  readonly connected = signal(false);
  readonly error = signal<null | string>(null);
  readonly log = signal<GameEvent[]>([]);
  readonly view = signal<null | PlayerView | PublicView>(null);
  readonly me = computed(() => {
    const view = this.view();
    return view && 'me' in view ? view.me : null;
  });
  readonly names = computed(() => {
    const map = new Map<string, string>();
    for (const p of this.lobby()?.players ?? [])
      map.set(p.id, p.name);
    return map;
  });

  readonly pending = signal(false);

  readonly you = signal<null | string>(null);

  private closed = false;
  private counter = 0;
  private gameId = '';
  private retry = 0;
  private socket?: WebSocket;
  private spectate = false;

  connect(gameId: string, spectate = false): void {
    this.gameId = gameId;
    this.spectate = spectate;
    this.open();
  }

  ngOnDestroy(): void {
    this.closed = true;
    this.socket?.close();
  }

  send(command: CommandInput): void {
    this.post({ type: 'command', id: this.nextId(), command });
  }

  setAvatar(avatar: string): void {
    this.post({ type: 'setAvatar', id: this.nextId(), avatar });
  }

  start(): void {
    this.post({ type: 'start', id: this.nextId() });
  }

  private handle(message: ServerMessage): void {
    switch (message.type) {
      case 'ack':
        this.pending.set(false);
        this.error.set(null);
        break;
      case 'error':
        this.pending.set(false);
        this.error.set(message.message);
        break;
      case 'lobby':
        this.lobby.set(message.lobby);
        break;
      case 'state':
        this.view.set(message.view);
        this.you.set(message.you);
        this.log.update((log) =>
          [...log, ...message.events].slice(-LOG_LIMIT),
        );
        break;
    }
  }

  private nextId(): string {
    return String(++this.counter);
  }

  private open(): void {
    const protocol =
      location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(
      `${protocol}://${location.host}/ws/${encodeURIComponent(this.gameId)}`,
    );
    this.socket = socket;
    socket.onopen = () => {
      this.retry = 0;
      this.connected.set(true);
      // Fresh snapshot and history arrive after hello.
      this.log.set([]);
      const seat = this.spectate ? null : loadSeat(this.gameId);
      socket.send(
        JSON.stringify({
          type: 'hello',
          seatToken: seat?.seatToken,
        }),
      );
    };
    socket.onmessage = (event) =>
      this.handle(
        JSON.parse(String(event.data)) as ServerMessage,
      );
    socket.onclose = (event) => {
      this.connected.set(false);
      this.pending.set(false);
      if (event.code === 4404 || event.code === 4401) {
        this.error.set(event.reason || 'Connection refused');
        return;
      }
      if (this.closed) return;
      const delay = Math.min(10_000, 500 * 2 ** this.retry++);
      setTimeout(() => this.open(), delay);
    };
  }

  private post(message: object): void {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      this.error.set('Not connected');
      return;
    }
    this.pending.set(true);
    this.socket.send(JSON.stringify(message));
  }
}
