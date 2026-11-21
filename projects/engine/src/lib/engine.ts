import type {
  GameEvent,
  GameSettings,
  PlayerInfo,
} from './schemas';

import { decide, type RandomSource, startGame } from './decide';
import { apply, type GameState, initialState } from './state';
import { playerView, publicView } from './views';

/**
 * Event-sourced game: state is always `events.reduce(apply)`.
 */
export class Game {
  get events(): readonly GameEvent[] {
    return this.log;
  }
  get state(): GameState {
    return this.current;
  }

  private current: GameState;
  private readonly log: GameEvent[] = [];

  constructor(
    events: readonly GameEvent[] = [],
    private readonly random: RandomSource = Math.random,
  ) {
    this.current = initialState();
    this.append(events);
  }

  /** Applies a player command; returns the new events. */
  dispatch(playerId: string, command: unknown): GameEvent[] {
    const result = decide(
      this.current,
      playerId,
      command,
      this.random,
    );
    if (!result.ok) throw new Error(result.error);
    this.append(result.events);
    return result.events;
  }

  playerView(playerId: string) {
    return playerView(this.current, playerId);
  }

  publicView() {
    return publicView(this.current);
  }

  start(
    settings: GameSettings,
    players: PlayerInfo[],
  ): GameEvent[] {
    if (this.log.length > 0)
      throw new Error('Game already started');
    const events = startGame(settings, players, this.random);
    this.append(events);
    return events;
  }

  private append(events: readonly GameEvent[]): void {
    for (const event of events) {
      this.log.push(event);
      this.current = apply(this.current, event);
    }
  }
}
