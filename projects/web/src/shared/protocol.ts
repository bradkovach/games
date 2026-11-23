import {
  type GameEvent,
  GameSettingsSchema,
  type PlayerView,
  type PublicView,
} from 'engine';
import { z } from 'zod';

import { isAvatar } from './avatars';

const AvatarSchema = z
  .string()
  .refine(isAvatar, { message: 'Unknown avatar' });

export const CHAT_MAX = 200;

export const ClientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('chat'),
    id: z.string().max(64),
    text: z.string().trim().min(1).max(CHAT_MAX),
  }),
  z.object({
    type: z.literal('command'),
    id: z.string().max(64),
    command: z.unknown(),
  }),
  z.object({
    type: z.literal('hello'),
    seatToken: z.string().max(128).optional(),
  }),
  z.object({ type: z.literal('start'), id: z.string().max(64) }),
  z.object({
    type: z.literal('setAvatar'),
    id: z.string().max(64),
    avatar: AvatarSchema,
  }),
]);
export type ActionMessage = Exclude<
  ClientMessage,
  { type: 'hello' }
>;
/** Table talk; kept apart from the game's event log. */
export interface ChatMessage {
  at: number;
  playerId: string;
  text: string;
}

export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export interface LobbyInfo {
  hostPlayerId: string;
  id: string;
  players: { avatar: string; id: string; name: string }[];
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
  | { lobby: LobbyInfo; type: 'lobby' }
  | { messages: ChatMessage[]; type: 'chat' };

export const JoinRequestSchema = z.object({
  avatar: AvatarSchema.optional(),
  code: z.string().min(1).max(512),
  name: z.string().trim().min(1).max(40),
});

export const AvatarsQuerySchema = z.object({
  code: z.string().min(1).max(512),
});

export const CreateGameSchema = z.object({
  avatar: AvatarSchema.optional(),
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
