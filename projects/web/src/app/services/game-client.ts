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
  ChatMessage,
  LobbyInfo,
  ServerMessage,
} from '../../shared/protocol';

import { avatarEmoji } from '../../shared/avatars';
import { clearSeat, loadSeat } from './seats';

const LOG_LIMIT = 300;
const CHAT_LIMIT = 100;

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
  readonly chat = signal<ChatMessage[]>([]);
  readonly chatError = signal<null | string>(null);
  readonly connected = signal(false);
  readonly error = signal<null | string>(null);
  /** Set once this device gives up its seat in the lobby. */
  readonly left = signal(false);
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

  /** Chat requests, whose replies must not touch `pending`. */
  private readonly chatIds = new Set<string>();
  private closed = false;
  private counter = 0;
  private gameId = '';
  private leaveId: null | string = null;
  private retry = 0;
  private socket?: WebSocket;
  private spectate = false;

  connect(gameId: string, spectate = false): void {
    this.gameId = gameId;
    this.spectate = spectate;
    this.open();
  }

  leave(): void {
    this.leaveId = this.nextId();
    this.post({ type: 'leave', id: this.leaveId });
  }

  ngOnDestroy(): void {
    this.closed = true;
    this.socket?.close();
  }

  patchSeat(patch: { avatar?: string; name?: string }): void {
    this.post({
      type: 'patchSeat',
      id: this.nextId(),
      ...patch,
    });
  }

  /** Drops the current socket and says hello again. */
  reconnect(spectate = false): void {
    this.spectate = spectate;
    this.error.set(null);
    if (!spectate) this.left.set(false);
    const old = this.socket;
    if (old) {
      old.onclose = null;
      old.close();
    }
    this.open();
  }

  say(text: string): void {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      this.chatError.set('Not connected');
      return;
    }
    const id = this.nextId();
    this.chatIds.add(id);
    this.socket.send(JSON.stringify({ type: 'chat', id, text }));
  }

  send(command: CommandInput): void {
    this.post({ type: 'command', command, id: this.nextId() });
  }

  private handle(message: ServerMessage): void {
    if (
      (message.type === 'ack' || message.type === 'error') &&
      this.chatIds.delete(message.id)
    ) {
      this.chatError.set(
        message.type === 'error' ? message.message : null,
      );
      return;
    }
    if (message.type === 'ack' && message.id === this.leaveId) {
      // The server already treats this socket as a spectator.
      clearSeat(this.gameId);
      this.spectate = true;
      this.left.set(true);
    }
    switch (message.type) {
      case 'ack':
        this.pending.set(false);
        this.error.set(null);
        break;
      case 'chat':
        this.chat.update((chat) =>
          [...chat, ...message.messages].slice(-CHAT_LIMIT),
        );
        break;
      case 'error':
        this.pending.set(false);
        this.error.set(message.message);
        break;
      case 'lobby':
        this.lobby.set(message.lobby);
        this.you.set(message.you);
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
      this.chat.set([]);
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
