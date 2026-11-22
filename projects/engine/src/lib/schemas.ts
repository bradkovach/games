import { z } from 'zod';

import { CHAINS } from './constants';
import { isTileId } from './tiles';

export const ChainIdSchema = z.enum(CHAINS);
export const TileIdSchema = z
  .string()
  .refine(isTileId, 'Invalid tile id');
export const PlayerIdSchema = z.string().min(1).max(64);

export const GameSettingsSchema = z.object({
  mode: z.enum(['classic', 'tycoon']).default('classic'),
  secretHoldings: z.boolean().default(false),
});
export type GameSettings = z.infer<typeof GameSettingsSchema>;

export const PlayerInfoSchema = z.object({
  id: PlayerIdSchema,
  name: z.string().min(1).max(40),
});
export type PlayerInfo = z.infer<typeof PlayerInfoSchema>;

const ChainCountsSchema = z.partialRecord(
  ChainIdSchema,
  z.int().min(0),
);

/** Player intents. Shape is validated here; legality in `decide`. */
export const CommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('placeTile'), tile: TileIdSchema }),
  z.object({ type: z.literal('passPlacement') }),
  z.object({
    type: z.literal('foundChain'),
    chain: ChainIdSchema,
  }),
  z.object({
    type: z.literal('chooseSurvivor'),
    chain: ChainIdSchema,
  }),
  z.object({
    type: z.literal('chooseAcquired'),
    chain: ChainIdSchema,
  }),
  z.object({
    type: z.literal('disposeStock'),
    sell: z.int().min(0).max(25),
    trade: z
      .int()
      .min(0)
      .max(25)
      .refine((n) => n % 2 === 0, 'Trades must be 2-for-1'),
  }),
  z.object({ type: z.literal('declareEnd') }),
  z.object({
    type: z.literal('endTurn'),
    discardDead: z.boolean().default(true),
    purchases: ChainCountsSchema.default({}),
  }),
]);
export type Command = z.infer<typeof CommandSchema>;
export type CommandInput = z.input<typeof CommandSchema>;

const PhaseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('notStarted') }),
  z.object({
    kind: z.literal('placeTile'),
    playerId: PlayerIdSchema,
  }),
  z.object({
    kind: z.literal('foundChain'),
    playerId: PlayerIdSchema,
    tile: TileIdSchema,
  }),
  z.object({
    candidates: z.array(ChainIdSchema),
    kind: z.literal('chooseSurvivor'),
    playerId: PlayerIdSchema,
    tile: TileIdSchema,
  }),
  z.object({
    candidates: z.array(ChainIdSchema),
    kind: z.literal('chooseAcquired'),
    playerId: PlayerIdSchema,
    remaining: z.array(ChainIdSchema),
    survivor: ChainIdSchema,
    tile: TileIdSchema,
  }),
  z.object({
    acquired: ChainIdSchema,
    kind: z.literal('disposeStock'),
    mergemaker: PlayerIdSchema,
    playerId: PlayerIdSchema,
    queue: z.array(PlayerIdSchema),
    remaining: z.array(ChainIdSchema),
    survivor: ChainIdSchema,
    tile: TileIdSchema,
  }),
  z.object({
    kind: z.literal('buyStock'),
    playerId: PlayerIdSchema,
  }),
  z.object({ kind: z.literal('gameOver') }),
]);
export type Phase = z.infer<typeof PhaseSchema>;

const PayoutsSchema = z.record(PlayerIdSchema, z.int());

export const GameResultsSchema = z.object({
  bonuses: z.partialRecord(ChainIdSchema, PayoutsSchema),
  finalCash: PayoutsSchema,
  sales: PayoutsSchema,
  winners: z.array(PlayerIdSchema),
});
export type GameResults = z.infer<typeof GameResultsSchema>;

/**
 * Facts appended to the game log. Replaying them through `apply`
 * rebuilds state. Optional fields are stripped by `redactEvent`.
 */
export const GameEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('gameStarted'),
    players: z.array(PlayerInfoSchema),
    settings: GameSettingsSchema,
  }),
  z.object({
    type: z.literal('startTileDrawn'),
    playerId: PlayerIdSchema,
    tile: TileIdSchema,
  }),
  z.object({
    type: z.literal('turnOrderSet'),
    order: z.array(PlayerIdSchema),
  }),
  z.object({
    type: z.literal('tileDrawn'),
    playerId: PlayerIdSchema,
    tile: TileIdSchema.optional(),
  }),
  z.object({
    type: z.literal('tilePlaced'),
    playerId: PlayerIdSchema,
    tile: TileIdSchema,
  }),
  z.object({
    type: z.literal('placementPassed'),
    playerId: PlayerIdSchema,
  }),
  z.object({
    type: z.literal('chainFounded'),
    chain: ChainIdSchema,
    founderCash: z.int().min(0),
    founderShare: z.boolean(),
    playerId: PlayerIdSchema,
    tiles: z.array(TileIdSchema),
  }),
  z.object({
    type: z.literal('chainGrown'),
    chain: ChainIdSchema,
    tiles: z.array(TileIdSchema),
  }),
  z.object({
    type: z.literal('mergeStarted'),
    chains: z.array(ChainIdSchema),
    playerId: PlayerIdSchema,
    tile: TileIdSchema,
  }),
  z.object({
    type: z.literal('bonusesPaid'),
    chain: ChainIdSchema,
    final: z.boolean(),
    payouts: PayoutsSchema,
  }),
  z.object({
    type: z.literal('stockDisposed'),
    cash: z.int().min(0).optional(),
    chain: ChainIdSchema,
    playerId: PlayerIdSchema,
    sell: z.int().min(0).optional(),
    survivor: ChainIdSchema,
    trade: z.int().min(0).optional(),
  }),
  z.object({
    type: z.literal('chainAcquired'),
    chain: ChainIdSchema,
    survivor: ChainIdSchema,
  }),
  z.object({
    type: z.literal('mergeCompleted'),
    survivor: ChainIdSchema,
    tiles: z.array(TileIdSchema),
  }),
  z.object({
    type: z.literal('stockPurchased'),
    cost: z.int().min(0).optional(),
    playerId: PlayerIdSchema,
    purchases: ChainCountsSchema.optional(),
  }),
  z.object({
    type: z.literal('tilesDiscarded'),
    playerId: PlayerIdSchema,
    tiles: z.array(TileIdSchema),
  }),
  z.object({
    type: z.literal('endDeclared'),
    playerId: PlayerIdSchema,
  }),
  z.object({ type: z.literal('phaseSet'), phase: PhaseSchema }),
  z.object({
    type: z.literal('gameEnded'),
    results: GameResultsSchema,
  }),
]);
export type GameEvent = z.infer<typeof GameEventSchema>;
export type GameEventType = GameEvent['type'];
