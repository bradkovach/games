import type { PlayerView, PublicView } from 'engine';

import type { ServerMessage } from '../shared/protocol';

import { Store } from './db';
import { type Connection, GameHub } from './hub';

function listener(playerId: null | string) {
  const messages: ServerMessage[] = [];
  const connection: Connection = {
    playerId,
    send: (m) => messages.push(m),
  };
  const lastView = () => {
    const states = messages.filter((m) => m.type === 'state');
    return states.at(-1)?.view as PlayerView | PublicView;
  };
  return { connection, lastView, messages };
}

describe('GameHub', () => {
  const host = { id: 'u1', name: 'Host' };
  let store: Store;
  let hub: GameHub;

  beforeEach(() => {
    store = new Store(':memory:');
    hub = new GameHub(store, 'test-secret', 'http://test');
  });

  async function seatedGame(secretHoldings: boolean) {
    const a = hub.createGame(host, {
      mode: 'classic',
      secretHoldings,
    });
    const invite = await hub.invite(a.gameId, host.id);
    const b = hub.join(invite.pin, 'Guest');
    return { a, b, invite };
  }

  it('seats players via PIN and only lets the host start', async () => {
    const { a, b, invite } = await seatedGame(false);
    expect(invite.pin).toMatch(/^\d{3}-\d{3}-\d{3}$/);
    expect(invite.qrSvg).toContain('<svg');
    await expect(
      hub.invite(a.gameId, 'intruder'),
    ).rejects.toThrow('Only the host');

    const guest = listener(b.playerId);
    hub.connect(a.gameId, guest.connection);
    hub.handle(a.gameId, guest.connection, {
      id: '1',
      type: 'start',
    });
    expect(guest.messages.at(-1)).toMatchObject({
      type: 'error',
    });

    const owner = listener(a.playerId);
    hub.connect(a.gameId, owner.connection);
    hub.handle(a.gameId, owner.connection, {
      id: '2',
      type: 'start',
    });
    expect(owner.messages).toContainEqual({
      id: '2',
      type: 'ack',
    });
    expect(() => hub.join(invite.pin, 'Late')).toThrow(
      'already started',
    );
  });

  it('persists events and replays them in a fresh hub', async () => {
    const { a } = await seatedGame(false);
    const owner = listener(a.playerId);
    hub.connect(a.gameId, owner.connection);
    hub.handle(a.gameId, owner.connection, {
      id: '1',
      type: 'start',
    });
    const before = owner.lastView() as PlayerView;

    const reloaded = new GameHub(
      store,
      'test-secret',
      'http://t',
    );
    const again = listener(a.playerId);
    reloaded.connect(a.gameId, again.connection);
    expect(again.lastView()).toEqual(before);
  });

  it('keeps hands and holdings private per connection', async () => {
    const { a, b } = await seatedGame(true);
    const owner = listener(a.playerId);
    const guest = listener(b.playerId);
    const spectator = listener(null);
    for (const l of [owner, guest, spectator]) {
      hub.connect(a.gameId, l.connection);
    }
    hub.handle(a.gameId, owner.connection, {
      id: '1',
      type: 'start',
    });

    const ownerView = owner.lastView() as PlayerView;
    const guestView = guest.lastView() as PlayerView;
    expect(ownerView.me.hand).toHaveLength(6);
    expect(guestView.me.id).toBe(b.playerId);

    const ownerTiles = ownerView.me.hand.map((t) => t.tile);
    const leaked = (l: ReturnType<typeof listener>) =>
      JSON.stringify(
        l.messages.filter((m) => m.type === 'state'),
      );
    const draws = (l: ReturnType<typeof listener>) =>
      l.messages
        .flatMap((m) => (m.type === 'state' ? m.events : []))
        .filter((e) => e.type === 'tileDrawn');
    for (const e of draws(guest)) {
      if (e.playerId === a.playerId)
        expect(e.tile).toBeUndefined();
    }
    expect(draws(spectator).every((e) => !e.tile)).toBe(true);
    expect('me' in spectator.lastView()).toBe(false);
    expect(
      spectator
        .lastView()
        .players.every((p) => p.cash === undefined),
    ).toBe(true);
    for (const tile of ownerTiles) {
      expect(leaked(spectator)).not.toContain(
        `"tile":"${tile}"`,
      );
    }
  });
});
