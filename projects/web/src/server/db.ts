import type { GameEvent, GameSettings } from 'engine';

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import type { ChatMessage } from '../shared/protocol';

export interface GameRow {
  created_at: number;
  host_player_id: string;
  host_user_id: string;
  id: string;
  settings_json: string;
}

export interface SeatRow {
  avatar: null | string;
  game_id: string;
  name: string;
  player_id: string;
  seat_order: number;
  token_hash: string;
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    host_user_id TEXT NOT NULL REFERENCES users(id),
    host_player_id TEXT NOT NULL,
    settings_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS seats (
    game_id TEXT NOT NULL REFERENCES games(id),
    player_id TEXT NOT NULL,
    name TEXT NOT NULL,
    seat_order INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    PRIMARY KEY (game_id, player_id)
  );
  CREATE TABLE IF NOT EXISTS game_events (
    game_id TEXT NOT NULL REFERENCES games(id),
    seq INTEGER NOT NULL,
    event_json TEXT NOT NULL,
    PRIMARY KEY (game_id, seq)
  );
  CREATE TABLE IF NOT EXISTS chat (
    game_id TEXT NOT NULL REFERENCES games(id),
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id TEXT NOT NULL,
    text TEXT NOT NULL,
    at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS chat_game ON chat (game_id, seq);
  CREATE TABLE IF NOT EXISTS join_pins (
    pin TEXT PRIMARY KEY,
    game_id TEXT NOT NULL REFERENCES games(id),
    expires_at INTEGER NOT NULL
  );
`;

/** Thin synchronous repository over better-sqlite3. */
export class Store {
  private readonly db: Database.Database;

  constructor(dataDir: string) {
    const file =
      dataDir === ':memory:'
        ? ':memory:'
        : join(dataDir, 'acquire.db');
    try {
      if (dataDir !== ':memory:')
        mkdirSync(dataDir, { recursive: true });
      this.db = new Database(file);
    } catch (error) {
      throw new Error(
        `Cannot open the database at ${file}; check that the ` +
          `directory exists and is writable by uid ` +
          `${process.getuid?.() ?? '?'}.`,
        { cause: error },
      );
    }
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.exec(SCHEMA);
    this.migrate();
  }

  addChat(gameId: string, message: ChatMessage): void {
    this.db
      .prepare(
        `INSERT INTO chat (game_id, player_id, text, at)
          VALUES (?, ?, ?, ?)`,
      )
      .run(gameId, message.playerId, message.text, message.at);
  }

  addSeat(seat: SeatRow): void {
    this.db
      .prepare(
        `INSERT INTO seats (game_id, player_id, name, avatar,
          seat_order, token_hash) VALUES (@game_id, @player_id,
          @name, @avatar, @seat_order, @token_hash)`,
      )
      .run(seat);
  }

  appendEvents(
    gameId: string,
    fromSeq: number,
    events: readonly GameEvent[],
  ): void {
    const insert = this.db.prepare(
      `INSERT INTO game_events (game_id, seq, event_json)
        VALUES (?, ?, ?)`,
    );
    this.db.transaction(() => {
      events.forEach((event, i) =>
        insert.run(gameId, fromSeq + i, JSON.stringify(event)),
      );
    })();
  }

  createGame(
    game: Omit<GameRow, 'created_at' | 'settings_json'> & {
      settings: GameSettings;
    },
  ): void {
    this.db
      .prepare(
        `INSERT INTO games (id, host_user_id, host_player_id,
          settings_json, created_at) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        game.id,
        game.host_user_id,
        game.host_player_id,
        JSON.stringify(game.settings),
        Date.now(),
      );
  }

  createPin(
    pin: string,
    gameId: string,
    expiresAt: number,
  ): boolean {
    this.db
      .prepare('DELETE FROM join_pins WHERE expires_at < ?')
      .run(Date.now());
    const result = this.db
      .prepare(
        `INSERT OR IGNORE INTO join_pins (pin, game_id, expires_at)
          VALUES (?, ?, ?)`,
      )
      .run(pin, gameId, expiresAt);
    return result.changes === 1;
  }

  /** Removes a game and everything that belongs to it. */
  deleteGame(gameId: string): void {
    this.db.transaction(() => {
      for (const table of [
        'join_pins',
        'chat',
        'game_events',
        'seats',
        'games',
      ]) {
        const column = table === 'games' ? 'id' : 'game_id';
        this.db
          .prepare(`DELETE FROM ${table} WHERE ${column} = ?`)
          .run(gameId);
      }
    })();
  }

  findPin(pin: string): string | undefined {
    const row = this.db
      .prepare(
        'SELECT game_id FROM join_pins WHERE pin = ? AND expires_at >= ?',
      )
      .get(pin, Date.now()) as undefined | { game_id: string };
    return row?.game_id;
  }

  findSeatByToken(tokenHash: string): SeatRow | undefined {
    return this.db
      .prepare('SELECT * FROM seats WHERE token_hash = ?')
      .get(tokenHash) as SeatRow | undefined;
  }

  getGame(id: string): GameRow | undefined {
    return this.db
      .prepare('SELECT * FROM games WHERE id = ?')
      .get(id) as GameRow | undefined;
  }

  /** The most recent `limit` messages, oldest first. */
  listChat(gameId: string, limit: number): ChatMessage[] {
    const rows = this.db
      .prepare(
        `SELECT player_id AS playerId, text, at FROM chat
          WHERE game_id = ? ORDER BY seq DESC LIMIT ?`,
      )
      .all(gameId, limit) as ChatMessage[];
    return rows.reverse();
  }

  listEvents(gameId: string): GameEvent[] {
    const rows = this.db
      .prepare(
        'SELECT event_json FROM game_events WHERE game_id = ? ORDER BY seq',
      )
      .all(gameId) as { event_json: string }[];
    return rows.map(
      (row) => JSON.parse(row.event_json) as GameEvent,
    );
  }

  listGameIds(): string[] {
    return (
      this.db.prepare('SELECT id FROM games').all() as {
        id: string;
      }[]
    ).map((row) => row.id);
  }

  listSeats(gameId: string): SeatRow[] {
    return this.db
      .prepare(
        'SELECT * FROM seats WHERE game_id = ? ORDER BY seat_order',
      )
      .all(gameId) as SeatRow[];
  }

  patchSeat(
    gameId: string,
    playerId: string,
    patch: { avatar?: string; name?: string },
  ): void {
    this.db
      .prepare(
        `UPDATE seats SET avatar = COALESCE(@avatar, avatar),
          name = COALESCE(@name, name)
          WHERE game_id = @gameId AND player_id = @playerId`,
      )
      .run({
        avatar: patch.avatar ?? null,
        gameId,
        name: patch.name ?? null,
        playerId,
      });
  }

  /** Cheap liveness check for the health endpoint. */
  ping(): void {
    this.db.prepare('SELECT 1').get();
  }

  removeSeat(gameId: string, playerId: string): void {
    this.db
      .prepare(
        'DELETE FROM seats WHERE game_id = ? AND player_id = ?',
      )
      .run(gameId, playerId);
  }

  /** `''` marks a host without a seat. */
  setHostPlayer(gameId: string, playerId: string): void {
    this.db
      .prepare(
        'UPDATE games SET host_player_id = ? WHERE id = ?',
      )
      .run(playerId, gameId);
  }

  upsertUser(user: {
    email?: string;
    id: string;
    name: string;
  }) {
    this.db
      .prepare(
        `INSERT INTO users (id, email, name, created_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET email = excluded.email,
            name = excluded.name`,
      )
      .run(user.id, user.email ?? null, user.name, Date.now());
  }

  /** Additive schema changes for databases created earlier. */
  private migrate(): void {
    const columns = this.db
      .prepare("SELECT name FROM pragma_table_info('seats')")
      .all() as { name: string }[];
    if (!columns.some((c) => c.name === 'avatar')) {
      this.db.exec('ALTER TABLE seats ADD COLUMN avatar TEXT');
    }
  }
}
