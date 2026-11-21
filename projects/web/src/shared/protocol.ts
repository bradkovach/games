import {
  type GameEvent,
  GameSettingsSchema,
  type PlayerView,
  type PublicView,
} from 'engine';
import { z } from 'zod';

export const ClientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    command: z.unknown(),
    id: z.string().max(64),
    type: z.literal('command'),
  }),
  z.object({
    seatToken: z.string().max(128).optional(),
    type: z.literal('hello'),
  }),
  z.object({ id: z.string().max(64), type: z.literal('start') }),
]);
export type ActionMessage = Exclude<
  ClientMessage,
  { type: 'hello' }
>;
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export interface LobbyInfo {
  hostPlayerId: string;
  id: string;
  players: { id: string; name: string }[];
  settings: z.infer<typeof GameSettingsSchema>;
  started: boolean;
}

export type ServerMessage =
  | {
      /** Redacted for the recipient. */
      events: GameEvent[];
      seq: number;
      type: 'state';
      view: PlayerView | PublicView;
      you: null | string;
    }
  | { id: string; message: string; type: 'error' }
  | { id: string; type: 'ack' }
  | { lobby: LobbyInfo; type: 'lobby' };

export const JoinRequestSchema = z.object({
  code: z.string().min(1).max(512),
  name: z.string().trim().min(1).max(40),
});

export const CreateGameSchema = z.object({
  mode: z.enum(['classic', 'tycoon']).default('classic'),
  secretHoldings: z.boolean().default(false),
});

export interface InviteInfo {
  expiresAt: number;
  pin: string;
  qrSvg: string;
  url: string;
}

export interface Me {
  email?: string;
  id: string;
  name: string;
}

export interface SeatGrant {
  gameId: string;
  playerId: string;
  seatToken: string;
}
