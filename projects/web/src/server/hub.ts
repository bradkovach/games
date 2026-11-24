import {
  Game,
  type GameEvent,
  type GameSettings,
  GameSettingsSchema,
  redactEvent,
} from 'engine';
import QRCode from 'qrcode';

import type {
  ActionMessage,
  ChatMessage,
  HostStatus,
  InviteInfo,
  LobbyInfo,
  Me,
  SeatGrant,
  ServerMessage,
} from '../shared/protocol';
import type { GameRow, SeatRow, Store } from './db';

import { firstFreeAvatar } from '../shared/avatars';
import {
  hashToken,
  INVITE_TTL_MS,
  newId,
  newPin,
  normalizePin,
  secureRandom,
  signInvite,
  verifyInvite,
} from './tokens';

export interface Connection {
  playerId: null | string;
  send(message: ServerMessage): void;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const HISTORY = 200;
const CHAT_HISTORY = 50;
const MAX_PLAYERS = 6;
/** Chat token bucket: a short burst, then one per interval. */
const CHAT_BURST = 3;
const CHAT_INTERVAL_MS = 2000;
export const DEFAULT_IDLE_MS = 15 * 60_000;

interface Room {
  chatBudget: Map<string, { at: number; tokens: number }>;
  connections: Set<Connection>;
  game: Game;
  row: GameRow;
  seats: SeatRow[];
}

/** Owns live games: persistence, seating and fan-out. */
export class GameHub {
  /** Pending deletions of games nobody is connected to. */
  private readonly idleTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  private readonly rooms = new Map<string, Room>();

  /**
   * Games are deleted `idleMs` after their last connection closes.
   * Games already stored get the same grace period, so a restart
   * gives everyone time to reconnect.
   */
  constructor(
    private readonly store: Store,
    private readonly secret: string,
    private readonly publicUrl: string,
    private readonly idleMs = DEFAULT_IDLE_MS,
  ) {
    for (const gameId of store.listGameIds()) {
      this.scheduleCleanup(gameId);
    }
  }

  authenticateSeat(
    gameId: string,
    token: string,
  ): null | SeatRow {
    const seat = this.store.findSeatByToken(hashToken(token));
    return seat?.game_id === gameId ? seat : null;
  }

  /** Avatars already chosen in the game an invite points to. */
  avatarsTaken(code: string): string[] {
    const room = this.room(this.resolveInvite(code));
    return room.seats.flatMap((s) =>
      s.avatar ? [s.avatar] : [],
    );
  }

  connect(gameId: string, connection: Connection): () => void {
    const room = this.room(gameId);
    room.connections.add(connection);
    clearTimeout(this.idleTimers.get(gameId));
    this.idleTimers.delete(gameId);
    connection.send({
      type: 'lobby',
      lobby: this.lobby(room),
      you: connection.playerId,
    });
    const chat = this.store.listChat(gameId, CHAT_HISTORY);
    if (chat.length > 0) {
      connection.send({ type: 'chat', messages: chat });
    }
    if (room.game.events.length > 0) {
      this.sendState(
        room,
        connection,
        room.game.events.slice(-HISTORY),
      );
    }
    return () => {
      if (
        room.connections.delete(connection) &&
        room.connections.size === 0
      ) {
        this.scheduleCleanup(gameId);
      }
    };
  }

  /** Creates a lobby; the host takes a seat separately, if at all. */
  createGame(
    user: Me,
    settings: GameSettings,
  ): { gameId: string } {
    const gameId = newId();
    this.store.upsertUser(user);
    this.store.createGame({
      host_player_id: '',
      host_user_id: user.id,
      id: gameId,
      settings,
    });
    this.scheduleCleanup(gameId);
    return { gameId };
  }

  /** Cancels pending cleanups (for shutdown). */
  dispose(): void {
    for (const timer of this.idleTimers.values()) {
      clearTimeout(timer);
    }
    this.idleTimers.clear();
  }

  exists(gameId: string): boolean {
    return this.store.getGame(gameId) !== undefined;
  }

  handle(
    gameId: string,
    connection: Connection,
    message: ActionMessage,
  ): void {
    const room = this.room(gameId);
    const { playerId } = connection;
    if (!playerId) {
      return connection.send({
        type: 'error',
        id: message.id,
        message: 'Spectators cannot act',
      });
    }
    if (message.type === 'chat') {
      return this.chat(
        room,
        connection,
        message.id,
        message.text,
      );
    }
    if (message.type === 'patchSeat') {
      return this.patchSeat(room, connection, message);
    }
    if (message.type === 'leave') {
      return this.leave(room, connection, message.id);
    }
    let events: GameEvent[];
    try {
      events = room.game.dispatch(playerId, message.command);
    } catch (error) {
      return connection.send({
        type: 'error',
        id: message.id,
        message: (error as Error).message,
      });
    }
    connection.send({ type: 'ack', id: message.id });
    this.publish(room, events);
  }

  hostStatus(gameId: string, userId?: string): HostStatus {
    const row = this.store.getGame(gameId);
    if (!row) throw new HttpError(404, 'Game not found');
    return { isHost: row.host_user_id === userId };
  }

  async invite(
    gameId: string,
    userId: string,
  ): Promise<InviteInfo> {
    this.requireHost(gameId, userId, 'invite players');
    const expiresAt = Date.now() + INVITE_TTL_MS;
    let pin = newPin();
    while (!this.store.createPin(pin, gameId, expiresAt))
      pin = newPin();
    const token = signInvite(this.secret, gameId, expiresAt);
    const url = `${this.publicUrl}/join?t=${encodeURIComponent(token)}`;
    const qrSvg = await QRCode.toString(url, {
      type: 'svg',
      margin: 1,
    });
    return { expiresAt, pin, qrSvg, url };
  }

  join(code: string, name: string, avatar?: string): SeatGrant {
    const room = this.room(this.resolveInvite(code));
    const grant = this.addSeat(room, name, avatar);
    this.broadcastLobby(room);
    return grant;
  }

  /** Seats the signed-in host on the device that asked. */
  seatHost(
    gameId: string,
    userId: string,
    name: string,
    avatar?: string,
  ): SeatGrant {
    this.requireHost(gameId, userId, 'take the host seat');
    const room = this.room(gameId);
    if (room.row.host_player_id) {
      throw new HttpError(409, 'You already have a seat');
    }
    const grant = this.addSeat(room, name, avatar);
    room.row.host_player_id = grant.playerId;
    this.store.setHostPlayer(gameId, grant.playerId);
    this.broadcastLobby(room);
    return grant;
  }

  start(gameId: string, userId: string): void {
    this.requireHost(gameId, userId, 'start the game');
    const room = this.room(gameId);
    if (room.game.events.length > 0) {
      throw new HttpError(409, 'The game has already started');
    }
    let events: GameEvent[];
    try {
      events = room.game.start(
        this.lobby(room).settings,
        room.seats.map((s) => ({
          id: s.player_id,
          name: s.name,
        })),
      );
    } catch (error) {
      throw new HttpError(409, (error as Error).message);
    }
    this.broadcastLobby(room);
    this.publish(room, events);
  }

  private addSeat(
    room: Room,
    name: string,
    avatar?: string,
  ): SeatGrant {
    if (room.game.events.length > 0) {
      throw new HttpError(409, 'The game has already started');
    }
    if (room.seats.length >= MAX_PLAYERS) {
      throw new HttpError(409, 'The game is full');
    }
    const taken = room.seats.map((s) => s.avatar);
    if (avatar && taken.includes(avatar)) {
      throw new HttpError(409, 'That avatar is already taken');
    }
    if (nameTaken(room, name)) {
      throw new HttpError(409, NAME_TAKEN);
    }
    const seatToken = newId(24);
    const seat: SeatRow = {
      avatar: avatar ?? firstFreeAvatar(taken) ?? null,
      game_id: room.row.id,
      name,
      player_id: newId(6),
      // Leaving frees seats, so counting them could repeat an order.
      seat_order:
        Math.max(-1, ...room.seats.map((s) => s.seat_order)) + 1,
      token_hash: hashToken(seatToken),
    };
    this.store.addSeat(seat);
    room.seats.push(seat);
    return {
      gameId: room.row.id,
      playerId: seat.player_id,
      seatToken,
    };
  }

  private broadcastLobby(room: Room): void {
    const lobby = this.lobby(room);
    for (const peer of room.connections) {
      peer.send({ type: 'lobby', lobby, you: peer.playerId });
    }
  }

  private chat(
    room: Room,
    connection: Connection,
    id: string,
    text: string,
  ): void {
    const playerId = connection.playerId!;
    const now = Date.now();
    const budget = room.chatBudget.get(playerId) ?? {
      at: now,
      tokens: CHAT_BURST,
    };
    budget.tokens = Math.min(
      CHAT_BURST,
      budget.tokens + (now - budget.at) / CHAT_INTERVAL_MS,
    );
    budget.at = now;
    room.chatBudget.set(playerId, budget);
    if (budget.tokens < 1) {
      return connection.send({
        type: 'error',
        id,
        message: 'Slow down — you are chatting too fast',
      });
    }
    budget.tokens -= 1;
    const message: ChatMessage = { at: now, playerId, text };
    this.store.addChat(room.row.id, message);
    connection.send({ type: 'ack', id });
    for (const peer of room.connections) {
      peer.send({ type: 'chat', messages: [message] });
    }
  }

  /** Gives up a seat before the game starts. */
  private leave(
    room: Room,
    connection: Connection,
    id: string,
  ): void {
    const seat = room.seats.find(
      (s) => s.player_id === connection.playerId,
    );
    if (!seat) {
      return connection.send({
        type: 'error',
        id,
        message: 'Spectators cannot act',
      });
    }
    if (room.game.events.length > 0) {
      return connection.send({
        type: 'error',
        id,
        message: 'You cannot leave once the game starts',
      });
    }
    room.seats = room.seats.filter((s) => s !== seat);
    this.store.removeSeat(room.row.id, seat.player_id);
    if (room.row.host_player_id === seat.player_id) {
      room.row.host_player_id = '';
      this.store.setHostPlayer(room.row.id, '');
    }
    connection.send({ type: 'ack', id });
    for (const peer of room.connections) {
      if (peer.playerId === seat.player_id) peer.playerId = null;
    }
    this.broadcastLobby(room);
  }

  private lobby(room: Room): LobbyInfo {
    return {
      hostPlayerId: room.row.host_player_id || null,
      id: room.row.id,
      players: room.seats.map((s) => ({
        avatar: s.avatar ?? '',
        id: s.player_id,
        name: s.name,
      })),
      settings: GameSettingsSchema.parse(
        JSON.parse(room.row.settings_json),
      ),
      started: room.game.events.length > 0,
    };
  }

  /** Validates the whole patch before applying any of it. */
  private patchSeat(
    room: Room,
    connection: Connection,
    {
      avatar,
      id,
      name,
    }: Extract<ActionMessage, { type: 'patchSeat' }>,
  ): void {
    const seat = room.seats.find(
      (s) => s.player_id === connection.playerId,
    );
    const error = (message: string) =>
      connection.send({ type: 'error', id, message });
    if (!seat) return error('Spectators cannot act');
    if (avatar === undefined && name === undefined) {
      return error('Nothing to change');
    }
    if (room.game.events.length > 0) {
      return error('Seats are locked once the game starts');
    }
    if (
      avatar !== undefined &&
      room.seats.some((s) => s !== seat && s.avatar === avatar)
    ) {
      return error('That avatar is already taken');
    }
    if (name !== undefined && nameTaken(room, name, seat)) {
      return error(NAME_TAKEN);
    }
    if (avatar !== undefined) seat.avatar = avatar;
    if (name !== undefined) seat.name = name;
    this.store.patchSeat(room.row.id, seat.player_id, {
      avatar,
      name,
    });
    connection.send({ type: 'ack', id });
    this.broadcastLobby(room);
  }

  private publish(room: Room, events: GameEvent[]): void {
    this.store.appendEvents(
      room.row.id,
      room.game.events.length - events.length,
      events,
    );
    for (const peer of room.connections) {
      this.sendState(room, peer, events);
    }
  }

  private requireHost(
    gameId: string,
    userId: string,
    action: string,
  ): void {
    const row = this.store.getGame(gameId);
    if (!row) throw new HttpError(404, 'Game not found');
    if (row.host_user_id !== userId) {
      throw new HttpError(403, `Only the host can ${action}`);
    }
  }

  private resolveInvite(code: string): string {
    const pin = normalizePin(code);
    const gameId = pin
      ? this.store.findPin(pin)
      : verifyInvite(this.secret, code);
    if (!gameId)
      throw new HttpError(400, 'Invite is invalid or expired');
    return gameId;
  }

  private room(gameId: string): Room {
    let room = this.rooms.get(gameId);
    if (room) return room;
    const row = this.store.getGame(gameId);
    if (!row) throw new HttpError(404, 'Game not found');
    room = {
      chatBudget: new Map(),
      connections: new Set(),
      game: new Game(
        this.store.listEvents(gameId),
        secureRandom,
      ),
      row,
      seats: this.store.listSeats(gameId),
    };
    // Seats created before avatars existed get the next free one.
    for (const seat of room.seats) {
      if (seat.avatar) continue;
      seat.avatar =
        firstFreeAvatar(room.seats.map((s) => s.avatar)) ?? null;
      if (seat.avatar) {
        this.store.patchSeat(gameId, seat.player_id, {
          avatar: seat.avatar,
        });
      }
    }
    this.rooms.set(gameId, room);
    return room;
  }

  private scheduleCleanup(gameId: string): void {
    clearTimeout(this.idleTimers.get(gameId));
    const timer = setTimeout(() => {
      this.idleTimers.delete(gameId);
      if (this.rooms.get(gameId)?.connections.size) return;
      this.rooms.delete(gameId);
      this.store.deleteGame(gameId);
    }, this.idleMs);
    timer.unref?.();
    this.idleTimers.set(gameId, timer);
  }

  private sendState(
    room: Room,
    connection: Connection,
    events: readonly GameEvent[],
  ): void {
    const { game } = room;
    const { playerId } = connection;
    connection.send({
      type: 'state',
      events: events.map((e) => redactEvent(e, playerId)),
      seq: game.events.length,
      view: playerId
        ? game.playerView(playerId)
        : game.publicView(),
      you: playerId,
    });
  }
}

const NAME_TAKEN = 'Another player already uses that name';

function nameTaken(
  room: Room,
  name: string,
  except?: SeatRow,
): boolean {
  const key = name.toLowerCase();
  return room.seats.some(
    (s) => s !== except && s.name.toLowerCase() === key,
  );
}
