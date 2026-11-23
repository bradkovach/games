import type { PlayerView } from './views';

import { type ChainId, CHAINS, MAX_PURCHASE } from './constants';
import { neighbors, type TileId } from './tiles';

export interface BuyOption {
  bank: number;
  chain: ChainId;
  /** Most shares of this chain alone the player can afford. */
  max: number;
  price: number;
}

export interface DisposeOption {
  acquired: ChainId;
  /** Shares of the acquired chain the player holds. */
  owned: number;
  price: number;
  survivor: ChainId;
  /** Largest even trade the survivor's bank can cover. */
  tradeMax: number;
}

/** What a seated player may do right now, from their view. */
export interface LegalMoves {
  buy?: {
    /** Whether any chain is on the board at all. */
    anyActive: boolean;
    cash: number;
    chains: BuyOption[];
    max: number;
  };
  declareEnd: boolean;
  dispose?: DisposeOption;
  found?: ChainId[];
  /** True when the game is waiting on this player. */
  myTurn: boolean;
  pass?: boolean;
  phase: PlayerView['phase']['kind'];
  pickAcquired?: ChainId[];
  pickSurvivor?: ChainId[];
  place?: TilePlay[];
}

export interface TilePlay {
  chains: ChainId[];
  effect: 'found' | 'grow' | 'independent' | 'merge';
  tile: TileId;
}

export function legalMoves(view: PlayerView): LegalMoves {
  const { me, phase } = view;
  const myTurn = 'playerId' in phase && phase.playerId === me.id;
  const moves: LegalMoves = {
    declareEnd:
      myTurn &&
      (phase.kind === 'placeTile' ||
        phase.kind === 'buyStock') &&
      view.canDeclareEnd &&
      !view.endDeclared,
    myTurn,
    phase: phase.kind,
  };
  if (!myTurn) return moves;
  const chain = (id: ChainId) =>
    view.chains.find((c) => c.chain === id)!;

  switch (phase.kind) {
    case 'buyStock': {
      const options = view.chains
        .filter((c) => c.active && c.bank > 0)
        .map((c) => ({
          bank: c.bank,
          chain: c.chain,
          max: Math.min(
            MAX_PURCHASE,
            c.bank,
            Math.floor(me.cash / c.price),
          ),
          price: c.price,
        }))
        .filter((c) => c.max > 0);
      moves.buy = {
        anyActive: view.chains.some((c) => c.active),
        cash: me.cash,
        chains: options,
        max: options.length > 0 ? MAX_PURCHASE : 0,
      };
      break;
    }
    case 'chooseAcquired':
      moves.pickAcquired = [...phase.candidates];
      break;
    case 'chooseSurvivor':
      moves.pickSurvivor = [...phase.candidates];
      break;
    case 'disposeStock': {
      const owned = me.stock[phase.acquired] ?? 0;
      const bank = chain(phase.survivor).bank;
      moves.dispose = {
        acquired: phase.acquired,
        owned,
        price: chain(phase.acquired).price,
        survivor: phase.survivor,
        tradeMax: Math.floor(Math.min(owned, bank * 2) / 2) * 2,
      };
      break;
    }
    case 'foundChain':
      moves.found = view.chains
        .filter((c) => !c.active)
        .map((c) => c.chain);
      break;
    case 'placeTile':
      moves.place = me.hand
        .filter((h) => h.status === 'playable')
        .map((h) => describePlay(view, h.tile));
      moves.pass = moves.place.length === 0;
      break;
  }
  return moves;
}

function describePlay(view: PlayerView, tile: TileId): TilePlay {
  const touched = new Set<ChainId>();
  let loose = false;
  for (const next of neighbors(tile)) {
    const owner = view.board[next];
    if (owner) touched.add(owner);
    else if (owner === null) loose = true;
  }
  const chains = CHAINS.filter((c) => touched.has(c));
  const effect =
    chains.length > 1
      ? 'merge'
      : chains.length === 1
        ? 'grow'
        : loose
          ? 'found'
          : 'independent';
  return { chains, effect, tile };
}
