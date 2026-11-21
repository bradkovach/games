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
  InviteInfo,
  LobbyInfo,
  Me,
  SeatGrant,
  ServerMessage,
} from '../shared/protocol';
import type { GameRow, SeatRow, Store } from './db';

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
const MAX_PLAYERS = 6;

interface Room {
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

  connect(gameId: string, connection: Connection): () => void {
    const room = this.room(gameId);
    room.connections.add(connection);
    connection.send({ lobby: this.lobby(room), type: 'lobby' });
    if (room.game.events.length > 0) {
      this.sendState(
        room,
        connection,
        room.game.events.slice(-HISTORY),
      );
    }
    return () => room.connections.delete(connection);
  }

  createGame(user: Me, settings: GameSettings): SeatGrant {
    const gameId = newId();
    const playerId = newId(6);
    this.store.upsertUser(user);
    this.store.createGame({
      host_player_id: playerId,
      host_user_id: user.id,
      id: gameId,
      settings,
    });
    return this.addSeat(gameId, playerId, user.name, 0);
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
        id: message.id,
        message: 'Spectators cannot act',
        type: 'error',
      });
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
        id: message.id,
        message: (error as Error).message,
        type: 'error',
      });
    }
    this.store.appendEvents(
      gameId,
      room.game.events.length - events.length,
      events,
    );
    connection.send({ id: message.id, type: 'ack' });
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
      margin: 1,
      type: 'svg',
    });
    return { expiresAt, pin, qrSvg, url };
  }

  join(code: string, name: string): SeatGrant {
    const pin = normalizePin(code);
    const gameId = pin
      ? this.store.findPin(pin)
      : verifyInvite(this.secret, code);
    if (!gameId)
      throw new HttpError(400, 'Invite is invalid or expired');
    const room = this.room(gameId);
    if (room.game.events.length > 0) {
      throw new HttpError(409, 'The game has already started');
    }
    if (room.seats.length >= MAX_PLAYERS) {
      throw new HttpError(409, 'The game is full');
    }
    const grant = this.addSeat(
      gameId,
      newId(6),
      name,
      room.seats.length,
    );
    this.broadcastLobby(room);
    return grant;
  }

  private addSeat(
    gameId: string,
    playerId: string,
    name: string,
    order: number,
  ): SeatGrant {
    const seatToken = newId(24);
    const seat: SeatRow = {
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
      peer.send({ lobby, type: 'lobby' });
    }
  }

  private lobby(room: Room): LobbyInfo {
    return {
      hostPlayerId: room.row.host_player_id,
      id: room.row.id,
      players: room.seats.map((s) => ({
        id: s.player_id,
        name: s.name,
      })),
      settings: GameSettingsSchema.parse(
        JSON.parse(room.row.settings_json),
      ),
      started: room.game.events.length > 0,
    };
  }

  private room(gameId: string): Room {
    let room = this.rooms.get(gameId);
    if (room) return room;
    const row = this.store.getGame(gameId);
    if (!row) throw new HttpError(404, 'Game not found');
    room = {
      connections: new Set(),
      game: new Game(
        this.store.listEvents(gameId),
        secureRandom,
      ),
      row,
      seats: this.store.listSeats(gameId),
    };
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
    const settings = game.state.settings;
    connection.send({
      events: events.map((e) =>
        redactEvent(e, playerId, settings),
      ),
      seq: game.events.length,
      type: 'state',
      view: playerId
        ? game.playerView(playerId)
        : game.publicView(),
      you: playerId,
    });
  }
}
