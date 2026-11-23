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

interface Room {
  chatBudget: Map<string, { at: number; tokens: number }>;
  connections: Set<Connection>;
  game: Game;
  row: GameRow;
  seats: SeatRow[];
}

/** Owns live games: persistence, seating and fan-out. */
export class GameHub {
  private readonly rooms = new Map<string, Room>();

  constructor(
    private readonly store: Store,
    private readonly secret: string,
    private readonly publicUrl: string,
  ) {}

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
    connection.send({ type: 'lobby', lobby: this.lobby(room) });
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
    return () => room.connections.delete(connection);
  }

  createGame(
    user: Me,
    settings: GameSettings,
    avatar?: string,
  ): SeatGrant {
    const gameId = newId();
    const playerId = newId(6);
    this.store.upsertUser(user);
    this.store.createGame({
      id: gameId,
      host_player_id: playerId,
      host_user_id: user.id,
      settings,
    });
    return this.addSeat(
      gameId,
      playerId,
      user.name,
      0,
      avatar ?? firstFreeAvatar([]) ?? null,
    );
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
    if (message.type === 'setAvatar') {
      return this.setAvatar(
        room,
        connection,
        message.id,
        message.avatar,
      );
    }
    let events: GameEvent[];
    try {
      if (message.type === 'start') {
        if (playerId !== room.row.host_player_id) {
          throw new Error('Only the host can start the game');
        }
        events = room.game.start(
          this.lobby(room).settings,
          room.seats.map((s) => ({
            id: s.player_id,
            name: s.name,
          })),
        );
      } else {
        events = room.game.dispatch(playerId, message.command);
      }
    } catch (error) {
      return connection.send({
        type: 'error',
        id: message.id,
        message: (error as Error).message,
      });
    }
    this.store.appendEvents(
      gameId,
      room.game.events.length - events.length,
      events,
    );
    connection.send({ type: 'ack', id: message.id });
    if (message.type === 'start') this.broadcastLobby(room);
    for (const peer of room.connections) {
      this.sendState(room, peer, events);
    }
  }

  async invite(
    gameId: string,
    userId: string,
  ): Promise<InviteInfo> {
    const row = this.store.getGame(gameId);
    if (!row) throw new HttpError(404, 'Game not found');
    if (row.host_user_id !== userId) {
      throw new HttpError(
        403,
        'Only the host can invite players',
      );
    }
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
    const gameId = this.resolveInvite(code);
    const room = this.room(gameId);
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
    const grant = this.addSeat(
      gameId,
      newId(6),
      name,
      room.seats.length,
      avatar ?? firstFreeAvatar(taken) ?? null,
    );
    this.broadcastLobby(room);
    return grant;
  }

  private addSeat(
    gameId: string,
    playerId: string,
    name: string,
    order: number,
    avatar: null | string,
  ): SeatGrant {
    const seatToken = newId(24);
    const seat: SeatRow = {
      avatar,
      game_id: gameId,
      name,
      player_id: playerId,
      seat_order: order,
      token_hash: hashToken(seatToken),
    };
    this.store.addSeat(seat);
    this.rooms.get(gameId)?.seats.push(seat);
    return { gameId, playerId, seatToken };
  }

  private broadcastLobby(room: Room): void {
    const lobby = this.lobby(room);
    for (const peer of room.connections) {
      peer.send({ type: 'lobby', lobby });
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

  private lobby(room: Room): LobbyInfo {
    return {
      id: room.row.id,
      hostPlayerId: room.row.host_player_id,
      players: room.seats.map((s) => ({
        id: s.player_id,
        avatar: s.avatar ?? '',
        name: s.name,
      })),
      settings: GameSettingsSchema.parse(
        JSON.parse(room.row.settings_json),
      ),
      started: room.game.events.length > 0,
    };
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
        this.store.setAvatar(
          gameId,
          seat.player_id,
          seat.avatar,
        );
      }
    }
    this.rooms.set(gameId, room);
    return room;
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

  private setAvatar(
    room: Room,
    connection: Connection,
    id: string,
    avatar: string,
  ): void {
    const seat = room.seats.find(
      (s) => s.player_id === connection.playerId,
    );
    const error = (message: string) =>
      connection.send({ type: 'error', id, message });
    if (!seat) return error('Spectators cannot act');
    if (room.game.events.length > 0) {
      return error('Avatars are locked once the game starts');
    }
    if (
      room.seats.some((s) => s !== seat && s.avatar === avatar)
    ) {
      return error('That avatar is already taken');
    }
    seat.avatar = avatar;
    this.store.setAvatar(room.row.id, seat.player_id, avatar);
    connection.send({ type: 'ack', id });
    this.broadcastLobby(room);
  }
}
