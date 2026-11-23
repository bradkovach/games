import {
  CHAIN_NAMES,
  type ChainId,
  type GameEvent,
} from 'engine';

const chain = (id: ChainId) => CHAIN_NAMES[id];
const money = (n: number) => `$${n.toLocaleString()}`;

/** Human-readable log line for an (already redacted) event. */
export function describeEvent(
  event: GameEvent,
  names: ReadonlyMap<string, string>,
): null | string {
  const who = (id: string) => names.get(id) ?? 'Someone';
  switch (event.type) {
    case 'bonusesPaid': {
      const paid = Object.entries(event.payouts)
        .map(([id, amount]) => `${who(id)} ${money(amount)}`)
        .join(', ');
      const label = event.final ? 'Final bonuses' : 'Bonuses';
      return `${label} for ${chain(event.chain)}: ${paid || 'none'}`;
    }
    case 'chainAcquired':
      return `${chain(event.survivor)} acquired ${chain(event.chain)}`;
    case 'chainFounded':
      return `${who(event.playerId)} founded ${chain(event.chain)}`;
    case 'chainGrown':
      return `${chain(event.chain)} grew to include ${event.tiles.join(', ')}`;
    case 'endDeclared':
      return `${who(event.playerId)} declared the game over`;
    case 'gameEnded':
      return `Game over! Winner: ${event.results.winners.map(who).join(' & ')}`;
    case 'gameStarted':
      return `Game started (${event.settings.mode} mode${
        event.settings.secretHoldings ? ', secret holdings' : ''
      })`;
    case 'mergeCompleted':
    case 'phaseSet':
    case 'tileDrawn':
    case 'turnOrderSet':
      return null;
    case 'mergeStarted':
      return `${who(event.playerId)} merged ${event.chains
        .map(chain)
        .join(' + ')} with ${event.tile}`;
    case 'placementPassed':
      return `${who(event.playerId)} had no playable tile`;
    case 'startTileDrawn':
      return `${who(event.playerId)} drew ${event.tile} for turn order`;
    case 'stockDisposed':
      return event.sell === undefined
        ? `${who(event.playerId)} handled their ${chain(event.chain)} stock`
        : `${who(event.playerId)} sold ${event.sell}, traded ${event.trade} ${chain(event.chain)}`;
    case 'stockPurchased':
      return event.purchases
        ? `${who(event.playerId)} bought ${Object.entries(
            event.purchases,
          )
            .map(([c, n]) => `${n} ${chain(c as ChainId)}`)
            .join(', ')}`
        : `${who(event.playerId)} bought stock`;
    case 'tilePlaced':
      return `${who(event.playerId)} placed ${event.tile}`;
    case 'tilesDiscarded':
      return `${who(event.playerId)} discarded ${event.tiles.join(', ')}`;
  }
}
