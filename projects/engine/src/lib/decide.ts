import {
  type ChainId,
  HAND_SIZE,
  MAX_PURCHASE,
} from './constants';
import { computeBonuses, sharePrice } from './pricing';
import {
  adjacentChains,
  availableChains,
  canDeclareEnd,
  classifyPlacement,
  hasPlayableTile,
  seatsFrom,
  tileStatus,
  unincorporatedGroup,
} from './rules';
import {
  type Command,
  CommandSchema,
  type GameEvent,
  type GameSettings,
  type Phase,
  type PlayerInfo,
} from './schemas';
import { finalScore } from './scoring';
import {
  activeChains,
  apply,
  chainSize,
  chainSizes,
  type GameState,
  initialState,
  remainingTiles,
} from './state';
import { compareTiles, type TileId } from './tiles';

export type DecideResult =
  | { error: string; ok: false }
  | { events: GameEvent[]; ok: true };

/** Returns a float in [0, 1). Only the server supplies this. */
export type RandomSource = () => number;

type MergeContext = Omit<
  Extract<Phase, { kind: 'disposeStock' }>,
  'kind' | 'playerId' | 'queue'
>;

/** Accumulates events while keeping a working copy of state. */
class Emitter {
  readonly events: GameEvent[] = [];

  constructor(
    public state: GameState,
    private readonly random: RandomSource,
  ) {}

  draw(playerId: string): boolean {
    const pile = remainingTiles(this.state);
    if (pile.length === 0) return false;
    const tile = pile[Math.floor(this.random() * pile.length)];
    this.emit({ type: 'tileDrawn', playerId, tile });
    return true;
  }

  emit(event: GameEvent): void {
    this.events.push(event);
    this.state = apply(this.state, event);
  }

  phase(phase: Phase): void {
    this.emit({ type: 'phaseSet', phase });
  }
}

export class RuleError extends Error {}

/**
 * Validates `input` against the schema and the current state, and
 * returns the events it produces. Never mutates `state`.
 */
export function decide(
  state: GameState,
  playerId: string,
  input: unknown,
  random: RandomSource,
): DecideResult {
  const parsed = CommandSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, ok: false };
  }
  try {
    const out = new Emitter(state, random);
    handle(out, playerId, parsed.data);
    return { events: out.events, ok: true };
  } catch (error) {
    if (error instanceof RuleError) {
      return { error: error.message, ok: false };
    }
    throw error;
  }
}

/** Builds the opening events: setup tiles, turn order, hands. */
export function startGame(
  settings: GameSettings,
  players: PlayerInfo[],
  random: RandomSource,
): GameEvent[] {
  if (players.length < 2 || players.length > 6) {
    fail('Acquire needs 2-6 players');
  }
  const out = new Emitter(initialState(), random);
  out.emit({ type: 'gameStarted', players, settings });
  const starts: { playerId: string; tile: TileId }[] = [];
  for (const { id } of players) {
    const pile = remainingTiles(out.state);
    const tile = pile[Math.floor(random() * pile.length)];
    starts.push({ playerId: id, tile });
    out.emit({ type: 'startTileDrawn', playerId: id, tile });
  }
  const first = [...starts].sort((a, b) =>
    compareTiles(a.tile, b.tile),
  )[0].playerId;
  const order = seatsFrom(out.state, first);
  out.emit({ type: 'turnOrderSet', order });
  for (const id of order) {
    for (let i = 0; i < HAND_SIZE; i++) out.draw(id);
  }
  out.phase({ kind: 'placeTile', playerId: first });
  return out.events;
}

function continueMerge(
  out: Emitter,
  mergemaker: string,
  tile: TileId,
  survivor: ChainId,
  remaining: ChainId[],
) {
  if (remaining.length === 0) {
    out.emit({
      type: 'mergeCompleted',
      survivor,
      tiles: unincorporatedGroup(out.state, tile),
    });
    return out.phase({ kind: 'buyStock', playerId: mergemaker });
  }
  const sizes = chainSizes(out.state);
  const largest = Math.max(...remaining.map((c) => sizes[c]));
  const candidates = remaining.filter(
    (c) => sizes[c] === largest,
  );
  if (candidates.length > 1) {
    return out.phase({
      candidates,
      kind: 'chooseAcquired',
      playerId: mergemaker,
      remaining,
      survivor,
      tile,
    });
  }
  startAcquisition(
    out,
    mergemaker,
    tile,
    survivor,
    candidates[0],
    remaining.filter((c) => c !== candidates[0]),
  );
}

function disposeStock(
  out: Emitter,
  phase: Extract<Phase, { kind: 'disposeStock' }>,
  sell: number,
  trade: number,
) {
  const { acquired, playerId, queue, survivor } = phase;
  const owned = out.state.stock[playerId][acquired];
  if (sell + trade > owned)
    fail('You do not own that many shares');
  if (trade / 2 > out.state.bank[survivor]) {
    fail('Not enough surviving-chain shares to trade for');
  }
  if (sell > 0 || trade > 0) {
    const price = sharePrice(
      acquired,
      chainSize(out.state, acquired),
    );
    out.emit({
      type: 'stockDisposed',
      cash: sell * price,
      chain: acquired,
      playerId,
      sell,
      survivor,
      trade,
    });
  }
  const { mergemaker, remaining, tile } = phase;
  nextHolder(
    out,
    { acquired, mergemaker, remaining, survivor, tile },
    queue,
  );
}

function endGame(out: Emitter) {
  const { state } = out;
  const results = finalScore({
    chainSizes: chainSizes(state),
    mode: state.settings.mode,
    players: state.players.map((p) => ({
      cash: state.cash[p.id],
      holdings: state.stock[p.id],
      id: p.id,
    })),
  });
  for (const [chain, payouts] of Object.entries(
    results.bonuses,
  )) {
    out.emit({
      type: 'bonusesPaid',
      chain: chain as ChainId,
      final: true,
      payouts,
    });
  }
  out.emit({ type: 'gameEnded', results });
  out.phase({ kind: 'gameOver' });
}

function endTurn(
  out: Emitter,
  playerId: string,
  command: Extract<Command, { type: 'endTurn' }>,
) {
  const purchases = Object.entries(command.purchases).filter(
    ([, count]) => count > 0,
  ) as [ChainId, number][];
  const total = purchases.reduce(
    (sum, [, count]) => sum + count,
    0,
  );
  if (total > MAX_PURCHASE) fail('You may buy at most 3 shares');
  const active = activeChains(out.state);
  let cost = 0;
  for (const [chain, count] of purchases) {
    if (!active.includes(chain))
      fail('That chain is not active');
    if (out.state.bank[chain] < count) {
      fail('Not enough shares left in the bank');
    }
    cost +=
      count * sharePrice(chain, chainSize(out.state, chain));
  }
  if (cost > out.state.cash[playerId]) fail('Not enough cash');
  if (purchases.length > 0) {
    out.emit({
      type: 'stockPurchased',
      cost,
      playerId,
      purchases: Object.fromEntries(purchases),
    });
  }

  if (out.state.endDeclared) return endGame(out);

  out.draw(playerId);
  if (command.discardDead) {
    const dead = out.state.hands[playerId].filter(
      (tile) => tileStatus(out.state, tile) === 'dead',
    );
    if (dead.length > 0) {
      out.emit({
        type: 'tilesDiscarded',
        playerId,
        tiles: dead,
      });
      dead.forEach(() => out.draw(playerId));
    }
  }

  const ids = out.state.players.map((p) => p.id);
  const next = ids[(ids.indexOf(playerId) + 1) % ids.length];
  out.phase({ kind: 'placeTile', playerId: next });
}

function fail(message: string): never {
  throw new RuleError(message);
}

function handle(
  out: Emitter,
  playerId: string,
  command: Command,
) {
  const { phase } = out.state;
  if (phase.kind === 'notStarted' || phase.kind === 'gameOver') {
    fail('The game is not in progress');
  }
  if (phase.playerId !== playerId) fail('It is not your turn');

  switch (command.type) {
    case 'chooseAcquired':
      if (phase.kind !== 'chooseAcquired')
        fail('Unexpected command');
      if (!phase.candidates.includes(command.chain)) {
        fail('That chain cannot be acquired next');
      }
      return startAcquisition(
        out,
        phase.playerId,
        phase.tile,
        phase.survivor,
        command.chain,
        phase.remaining.filter((c) => c !== command.chain),
      );
    case 'chooseSurvivor': {
      if (phase.kind !== 'chooseSurvivor')
        fail('Unexpected command');
      if (!phase.candidates.includes(command.chain)) {
        fail('That chain cannot survive this merger');
      }
      const chains = adjacentChains(out.state, phase.tile);
      return continueMerge(
        out,
        phase.playerId,
        phase.tile,
        command.chain,
        chains.filter((c) => c !== command.chain),
      );
    }
    case 'declareEnd':
      if (
        phase.kind !== 'placeTile' &&
        phase.kind !== 'buyStock'
      ) {
        fail('You can only declare the end during your turn');
      }
      if (out.state.endDeclared)
        fail('The end is already declared');
      if (!canDeclareEnd(out.state)) {
        fail('The game end conditions are not met');
      }
      return out.emit({ type: 'endDeclared', playerId });
    case 'disposeStock':
      if (phase.kind !== 'disposeStock')
        fail('Unexpected command');
      return disposeStock(
        out,
        phase,
        command.sell,
        command.trade,
      );
    case 'endTurn':
      if (phase.kind !== 'buyStock') fail('Place a tile first');
      return endTurn(out, playerId, command);
    case 'foundChain': {
      if (phase.kind !== 'foundChain')
        fail('Unexpected command');
      if (!availableChains(out.state).includes(command.chain)) {
        fail('That chain is already on the board');
      }
      const tiles = unincorporatedGroup(out.state, phase.tile);
      const founderShare = out.state.bank[command.chain] > 0;
      out.emit({
        type: 'chainFounded',
        chain: command.chain,
        founderCash: founderShare
          ? 0
          : sharePrice(command.chain, tiles.length),
        founderShare,
        playerId,
        tiles,
      });
      return out.phase({ kind: 'buyStock', playerId });
    }
    case 'passPlacement':
      if (phase.kind !== 'placeTile') fail('Unexpected command');
      if (hasPlayableTile(out.state, playerId)) {
        fail('You have a playable tile');
      }
      out.emit({ type: 'placementPassed', playerId });
      return out.phase({ kind: 'buyStock', playerId });
    case 'placeTile':
      if (phase.kind !== 'placeTile') fail('Unexpected command');
      return placeTile(out, playerId, command.tile);
  }
}

function nextHolder(
  out: Emitter,
  context: MergeContext,
  holders: string[],
) {
  const [playerId, ...queue] = holders;
  if (playerId) {
    return out.phase({
      ...context,
      kind: 'disposeStock',
      playerId,
      queue,
    });
  }
  out.emit({
    type: 'chainAcquired',
    chain: context.acquired,
    survivor: context.survivor,
  });
  continueMerge(
    out,
    context.mergemaker,
    context.tile,
    context.survivor,
    context.remaining,
  );
}

function placeTile(
  out: Emitter,
  playerId: string,
  tile: TileId,
) {
  if (!out.state.hands[playerId].includes(tile)) {
    fail('That tile is not in your hand');
  }
  const placement = classifyPlacement(out.state, tile);
  if (placement.kind === 'dead') {
    fail('That tile would merge two safe chains');
  }
  if (placement.kind === 'unplayable') {
    fail('No chains are available to found');
  }
  out.emit({ type: 'tilePlaced', playerId, tile });

  switch (placement.kind) {
    case 'found':
      return out.phase({ kind: 'foundChain', playerId, tile });
    case 'grow':
      out.emit({
        type: 'chainGrown',
        chain: placement.chain,
        tiles: placement.group,
      });
      return out.phase({ kind: 'buyStock', playerId });
    case 'independent':
      return out.phase({ kind: 'buyStock', playerId });
    case 'merge': {
      out.emit({
        type: 'mergeStarted',
        chains: placement.chains,
        playerId,
        tile,
      });
      const sizes = chainSizes(out.state);
      const largest = Math.max(
        ...placement.chains.map((c) => sizes[c]),
      );
      const candidates = placement.chains.filter(
        (c) => sizes[c] === largest,
      );
      if (candidates.length > 1) {
        return out.phase({
          candidates,
          kind: 'chooseSurvivor',
          playerId,
          tile,
        });
      }
      return continueMerge(
        out,
        playerId,
        tile,
        candidates[0],
        placement.chains.filter((c) => c !== candidates[0]),
      );
    }
  }
}

function startAcquisition(
  out: Emitter,
  mergemaker: string,
  tile: TileId,
  survivor: ChainId,
  acquired: ChainId,
  remaining: ChainId[],
) {
  const { state } = out;
  const holdings = Object.fromEntries(
    state.players.map((p) => [
      p.id,
      state.stock[p.id][acquired],
    ]),
  );
  out.emit({
    type: 'bonusesPaid',
    chain: acquired,
    final: false,
    payouts: computeBonuses(
      holdings,
      acquired,
      chainSize(state, acquired),
      state.settings.mode,
    ),
  });
  const holders = seatsFrom(state, mergemaker).filter(
    (id) => state.stock[id][acquired] > 0,
  );
  nextHolder(
    out,
    {
      acquired,
      mergemaker,
      remaining,
      survivor,
      tile,
    },
    holders,
  );
}
