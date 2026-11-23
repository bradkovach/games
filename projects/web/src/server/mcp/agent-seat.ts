import type { GameEvent, PlayerView } from 'engine';

import type {
  ActionMessage,
  ChatMessage,
  LobbyInfo,
  ServerMessage,
} from '../../shared/protocol';
import type { Connection, GameHub } from '../hub';

type Action = ActionMessage extends infer T
  ? T extends unknown
    ? Omit<T, 'id'>
    : never
  : never;
type Outcome = { error: string; ok: false } | { ok: true };

/**
 * An agent's seat at the table. It joins the hub like a browser
 * socket, so it only ever receives that player's redacted view.
 */
export class AgentSeat implements Connection {
  lobby: LobbyInfo | null = null;
  view: null | PlayerView = null;
  private closed = false;
  private counter = 0;
  private readonly disconnect: () => void;
  private freshChat: ChatMessage[] = [];
  private freshEvents: GameEvent[] = [];
  private outcomes = new Map<string, Outcome>();
  private readonly waiters = new Set<() => void>();

  constructor(
    private readonly hub: GameHub,
    readonly gameId: string,
    readonly playerId: string,
  ) {
    this.disconnect = hub.connect(gameId, this);
  }

  /** Runs an action through the hub and reports its outcome. */
  act(message: Action): Outcome {
    const id = `mcp-${++this.counter}`;
    this.hub.handle(this.gameId, this, {
      ...message,
      id,
    } as ActionMessage);
    // The hub replies synchronously.
    const outcome = this.outcomes.get(id) ?? {
      error: 'No reply from the game',
      ok: false,
    };
    this.outcomes.delete(id);
    return outcome;
  }

  close(): void {
    this.closed = true;
    this.disconnect();
    for (const wake of this.waiters) wake();
  }

  /** Whether another player has said something not yet reported. */
  hasFreshTalk(): boolean {
    return this.freshChat.some(
      (m) => m.playerId !== this.playerId,
    );
  }

  send(message: ServerMessage): void {
    switch (message.type) {
      case 'ack':
        this.outcomes.set(message.id, { ok: true });
        break;
      case 'chat':
        this.freshChat.push(...message.messages);
        break;
      case 'error':
        this.outcomes.set(message.id, {
          error: message.message,
          ok: false,
        });
        break;
      case 'lobby':
        this.lobby = message.lobby;
        break;
      case 'state':
        this.view = message.view as PlayerView;
        this.freshEvents.push(...message.events);
        break;
    }
    for (const wake of this.waiters) wake();
  }

  /** Events and chat received since the last call. */
  takeNews(): { chat: ChatMessage[]; events: GameEvent[] } {
    const news = {
      chat: this.freshChat,
      events: this.freshEvents,
    };
    this.freshChat = [];
    this.freshEvents = [];
    return news;
  }

  /**
   * Resolves `true` as soon as `ready()` holds, or `false` after
   * `timeoutMs` or when `signal` aborts.
   */
  until(
    ready: () => boolean,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<boolean> {
    if (ready()) return Promise.resolve(true);
    return new Promise((resolve) => {
      const finish = (result: boolean) => {
        clearTimeout(timer);
        this.waiters.delete(check);
        signal?.removeEventListener('abort', stop);
        resolve(result);
      };
      const check = () => {
        if (this.closed) finish(false);
        else if (ready()) finish(true);
      };
      const stop = () => finish(false);
      const timer = setTimeout(stop, timeoutMs);
      this.waiters.add(check);
      signal?.addEventListener('abort', stop);
    });
  }
}
