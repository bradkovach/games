import type { CommandInput } from './schemas';

import { CHAINS, SHARES_PER_CHAIN } from './constants';
import { Game } from './engine';
import { availableChains } from './rules';
import { activeChains } from './state';

function chooseCommand(game: Game, random: () => number) {
  const { state } = game;
  const { phase } = state;
  if (phase.kind === 'notStarted' || phase.kind === 'gameOver') {
    throw new Error('No move');
  }
  const me = game.playerView(phase.playerId).me;
  let command: CommandInput;
  switch (phase.kind) {
    case 'buyStock': {
      if (
        game.publicView().canDeclareEnd &&
        !state.endDeclared
      ) {
        command = { type: 'declareEnd' };
        break;
      }
      const chain = pick(activeChains(state), random);
      const count = Math.floor(random() * 4);
      command = {
        purchases: chain ? { [chain]: count } : {},
        type: 'endTurn',
      };
      break;
    }
    case 'chooseAcquired':
    case 'chooseSurvivor':
      command = {
        chain: pick(phase.candidates, random),
        type: phase.kind,
      };
      break;
    case 'disposeStock': {
      const owned = me.stock[phase.acquired];
      const trade = Math.min(
        Math.floor((owned * random()) / 2) * 2,
        state.bank[phase.survivor] * 2,
      );
      const sell = Math.floor((owned - trade) * random());
      command = { sell, trade, type: 'disposeStock' };
      break;
    }
    case 'foundChain':
      command = {
        chain: pick(availableChains(state), random),
        type: 'foundChain',
      };
      break;
    case 'placeTile': {
      const playable = me.hand.filter(
        (t) => t.status === 'playable',
      );
      command =
        playable.length > 0
          ? {
              tile: pick(playable, random).tile,
              type: 'placeTile',
            }
          : { type: 'passPlacement' };
      break;
    }
  }
  return { command, playerId: phase.playerId };
}

function pick<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length)];
}

function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('random full games', () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    it(`plays seed ${seed} to completion`, () => {
      const random = seeded(seed);
      const players = Array.from(
        { length: 2 + (seed % 5) },
        (_, i) => ({
          id: `p${i}`,
          name: `P${i}`,
        }),
      );
      const game = new Game([], random);
      game.start(
        {
          mode: seed % 2 ? 'classic' : 'tycoon',
          secretHoldings: true,
        },
        players,
      );
      let steps = 0;
      while (
        game.state.phase.kind !== 'gameOver' &&
        steps < 5000
      ) {
        const { command, playerId } = chooseCommand(
          game,
          random,
        );
        try {
          game.dispatch(playerId, command);
        } catch {
          // Random purchases may be unaffordable; end turn plainly.
          game.dispatch(playerId, { type: 'endTurn' });
        }
        steps++;
        for (const chain of CHAINS) {
          const held = players.reduce(
            (sum, p) => sum + game.state.stock[p.id][chain],
            0,
          );
          expect(held + game.state.bank[chain]).toBe(
            SHARES_PER_CHAIN,
          );
        }
        for (const p of players) {
          expect(game.state.cash[p.id]).toBeGreaterThanOrEqual(
            0,
          );
        }
      }
      expect(game.state.phase.kind).toBe('gameOver');
      expect(game.state.results?.winners.length).toBeGreaterThan(
        0,
      );
      expect(new Game(game.events).state).toEqual(game.state);
    });
  }
});
