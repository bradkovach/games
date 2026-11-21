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
  z.object({ tile: TileIdSchema, type: z.literal('placeTile') }),
  z.object({ type: z.literal('passPlacement') }),
  z.object({
    chain: ChainIdSchema,
    type: z.literal('foundChain'),
  }),
  z.object({
    chain: ChainIdSchema,
    type: z.literal('chooseSurvivor'),
  }),
  z.object({
    chain: ChainIdSchema,
    type: z.literal('chooseAcquired'),
  }),
  z.object({
    sell: z.int().min(0).max(25),
    trade: z
      .int()
      .min(0)
      .max(25)
      .refine((n) => n % 2 === 0, 'Trades must be 2-for-1'),
    type: z.literal('disposeStock'),
  }),
  z.object({ type: z.literal('declareEnd') }),
  z.object({
    discardDead: z.boolean().default(true),
    purchases: ChainCountsSchema.default({}),
    type: z.literal('endTurn'),
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
    players: z.array(PlayerInfoSchema),
    settings: GameSettingsSchema,
    type: z.literal('gameStarted'),
  }),
  z.object({
    playerId: PlayerIdSchema,
    tile: TileIdSchema,
    type: z.literal('startTileDrawn'),
  }),
  z.object({
    order: z.array(PlayerIdSchema),
    type: z.literal('turnOrderSet'),
  }),
  z.object({
    playerId: PlayerIdSchema,
    tile: TileIdSchema.optional(),
    type: z.literal('tileDrawn'),
  }),
  z.object({
    playerId: PlayerIdSchema,
    tile: TileIdSchema,
    type: z.literal('tilePlaced'),
  }),
  z.object({
    playerId: PlayerIdSchema,
    type: z.literal('placementPassed'),
  }),
  z.object({
    chain: ChainIdSchema,
    founderCash: z.int().min(0),
    founderShare: z.boolean(),
    playerId: PlayerIdSchema,
    tiles: z.array(TileIdSchema),
    type: z.literal('chainFounded'),
  }),
  z.object({
    chain: ChainIdSchema,
    tiles: z.array(TileIdSchema),
    type: z.literal('chainGrown'),
  }),
  z.object({
    chains: z.array(ChainIdSchema),
    playerId: PlayerIdSchema,
    tile: TileIdSchema,
    type: z.literal('mergeStarted'),
  }),
  z.object({
    chain: ChainIdSchema,
    final: z.boolean(),
    payouts: PayoutsSchema,
    type: z.literal('bonusesPaid'),
  }),
  z.object({
    cash: z.int().min(0).optional(),
    chain: ChainIdSchema,
    playerId: PlayerIdSchema,
    sell: z.int().min(0).optional(),
    survivor: ChainIdSchema,
    trade: z.int().min(0).optional(),
    type: z.literal('stockDisposed'),
  }),
  z.object({
    chain: ChainIdSchema,
    survivor: ChainIdSchema,
    type: z.literal('chainAcquired'),
  }),
  z.object({
    survivor: ChainIdSchema,
    tiles: z.array(TileIdSchema),
    type: z.literal('mergeCompleted'),
  }),
  z.object({
    cost: z.int().min(0).optional(),
    playerId: PlayerIdSchema,
    purchases: ChainCountsSchema.optional(),
    type: z.literal('stockPurchased'),
  }),
  z.object({
    playerId: PlayerIdSchema,
    tiles: z.array(TileIdSchema),
    type: z.literal('tilesDiscarded'),
  }),
  z.object({
    playerId: PlayerIdSchema,
    type: z.literal('endDeclared'),
  }),
  z.object({ phase: PhaseSchema, type: z.literal('phaseSet') }),
  z.object({
    results: GameResultsSchema,
    type: z.literal('gameEnded'),
  }),
]);
export type GameEvent = z.infer<typeof GameEventSchema>;
export type GameEventType = GameEvent['type'];
