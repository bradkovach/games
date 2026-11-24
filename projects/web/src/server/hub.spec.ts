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
    const { gameId } = hub.createGame(host, {
      mode: 'classic',
      secretHoldings,
    });
    const a = hub.seatHost(gameId, host.id, 'Host');
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

    expect(b.playerId).not.toBe(a.playerId);
    expect(() => hub.start(a.gameId, 'intruder')).toThrow(
      'Only the host',
    );

    const owner = listener(a.playerId);
    hub.connect(a.gameId, owner.connection);
    hub.start(a.gameId, host.id);
    expect(owner.lastView()).toBeDefined();
    expect(() => hub.start(a.gameId, host.id)).toThrow(
      'already started',
    );
    expect(() => hub.join(invite.pin, 'Late')).toThrow(
      'already started',
    );
  });

  it('persists events and replays them in a fresh hub', async () => {
    const { a } = await seatedGame(false);
    const owner = listener(a.playerId);
    hub.connect(a.gameId, owner.connection);
    hub.start(a.gameId, host.id);
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
    hub.start(a.gameId, host.id);

    const ownerView = owner.lastView() as PlayerView;
    const guestView = guest.lastView() as PlayerView;
    expect(ownerView.me.hand).toHaveLength(6);
    expect(guestView.me.id).toBe(b.playerId);
    expect(
      guestView.players.every(
        (p) => p.cash === undefined && p.stock === undefined,
      ),
    ).toBe(true);

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

  describe('avatars', () => {
    const lobbyAvatars = (messages: ServerMessage[]) => {
      const lobby = messages
        .filter((m) => m.type === 'lobby')
        .at(-1);
      return lobby?.type === 'lobby'
        ? lobby.lobby.players.map((p) => p.avatar)
        : [];
    };

    it('keeps avatars distinct when joining', async () => {
      const { gameId } = hub.createGame(host, {
        mode: 'classic',
        secretHoldings: false,
      });
      hub.seatHost(gameId, host.id, 'Host', '⚓');
      const { pin } = await hub.invite(gameId, host.id);
      expect(() => hub.join(pin, 'Copycat', '⚓')).toThrow(
        'already taken',
      );
      hub.join(pin, 'Guest', '☕');
      hub.join(pin, 'Auto');
      expect(hub.avatarsTaken(pin)).toEqual(['⚓', '☕', '☀']);
    });

    it('lets players change avatars only in the lobby', async () => {
      const { a, b } = await seatedGame(false);
      const guest = listener(b.playerId);
      hub.connect(a.gameId, guest.connection);
      const [hostAvatar] = lobbyAvatars(guest.messages);

      hub.handle(a.gameId, guest.connection, {
        type: 'patchSeat',
        avatar: hostAvatar as '☀',
        id: '1',
      });
      expect(guest.messages.at(-1)).toMatchObject({
        type: 'error',
        message: 'That avatar is already taken',
      });

      hub.handle(a.gameId, guest.connection, {
        type: 'patchSeat',
        avatar: '⛵',
        id: '2',
      });
      expect(lobbyAvatars(guest.messages)).toEqual([
        hostAvatar,
        '⛵',
      ]);
      expect(store.listSeats(a.gameId)[1].avatar).toBe('⛵');

      const owner = listener(a.playerId);
      hub.connect(a.gameId, owner.connection);
      hub.start(a.gameId, host.id);
      hub.handle(a.gameId, guest.connection, {
        type: 'patchSeat',
        avatar: '✈',
        id: '4',
      });
      expect(guest.messages.at(-1)).toMatchObject({
        type: 'error',
        message: 'Seats are locked once the game starts',
      });
    });
  });

  describe('lobby seats', () => {
    const lastLobby = (messages: ServerMessage[]) => {
      const m = messages
        .filter((x) => x.type === 'lobby')
        .at(-1);
      return m?.type === 'lobby' ? m : undefined;
    };

    it('creates games without a seat and seats the host once', () => {
      const { gameId } = hub.createGame(host, {
        mode: 'classic',
        secretHoldings: false,
      });
      const watcher = listener(null);
      hub.connect(gameId, watcher.connection);
      expect(lastLobby(watcher.messages)?.lobby).toMatchObject({
        hostPlayerId: null,
        players: [],
      });
      expect(hub.hostStatus(gameId, host.id).isHost).toBe(true);
      expect(hub.hostStatus(gameId).isHost).toBe(false);
      expect(() =>
        hub.seatHost(gameId, 'intruder', 'Eve'),
      ).toThrow('Only the host');

      const seat = hub.seatHost(gameId, host.id, 'Captain');
      expect(lastLobby(watcher.messages)?.lobby).toMatchObject({
        hostPlayerId: seat.playerId,
        players: [{ id: seat.playerId, name: 'Captain' }],
      });
      expect(() =>
        hub.seatHost(gameId, host.id, 'Again'),
      ).toThrow('already have a seat');
      expect(() => hub.start(gameId, host.id)).toThrow();
    });

    it('applies a name and avatar patch all or nothing', async () => {
      const { a, b } = await seatedGame(false);
      const guest = listener(b.playerId);
      hub.connect(a.gameId, guest.connection);
      const patch = (patch: {
        avatar?: '☀' | '⛵';
        name?: string;
      }) =>
        hub.handle(a.gameId, guest.connection, {
          type: 'patchSeat',
          id: 'p',
          ...patch,
        });

      patch({});
      expect(guest.messages.at(-1)).toMatchObject({
        type: 'error',
        message: 'Nothing to change',
      });
      // The name is fine but the avatar is the host's: no change.
      patch({ avatar: '☀', name: 'Ziggy' });
      expect(guest.messages.at(-1)).toMatchObject({
        type: 'error',
      });
      expect(store.listSeats(a.gameId)[1].name).not.toBe(
        'Ziggy',
      );

      patch({ avatar: '⛵', name: 'Ziggy' });
      expect(store.listSeats(a.gameId)[1]).toMatchObject({
        avatar: '⛵',
        name: 'Ziggy',
      });
    });

    it('lets players rename themselves before the start', async () => {
      const { a, b } = await seatedGame(false);
      const guest = listener(b.playerId);
      hub.connect(a.gameId, guest.connection);
      expect(lastLobby(guest.messages)?.you).toBe(b.playerId);
      const rename = (id: string, name: string) =>
        hub.handle(a.gameId, guest.connection, {
          type: 'patchSeat',
          id,
          name,
        });

      rename('1', 'HOST');
      expect(guest.messages.at(-1)).toMatchObject({
        type: 'error',
        message: 'Another player already uses that name',
      });
      rename('2', 'Ziggy');
      expect(
        lastLobby(guest.messages)?.lobby.players[1].name,
      ).toBe('Ziggy');
      expect(store.listSeats(a.gameId)[1].name).toBe('Ziggy');

      hub.start(a.gameId, host.id);
      rename('3', 'Late');
      expect(guest.messages.at(-1)).toMatchObject({
        type: 'error',
        message: 'Seats are locked once the game starts',
      });
    });

    it('lets any player leave before the start', async () => {
      const { a, b, invite } = await seatedGame(false);
      const owner = listener(a.playerId);
      const guest = listener(b.playerId);
      hub.connect(a.gameId, owner.connection);
      hub.connect(a.gameId, guest.connection);

      hub.handle(a.gameId, guest.connection, {
        type: 'leave',
        id: '1',
      });
      expect(guest.messages).toContainEqual({
        type: 'ack',
        id: '1',
      });
      expect(guest.connection.playerId).toBeNull();
      expect(lastLobby(guest.messages)?.you).toBeNull();
      expect(
        lastLobby(owner.messages)?.lobby.players.map(
          (p) => p.id,
        ),
      ).toEqual([a.playerId]);
      expect(hub.authenticateSeat(a.gameId, b.seatToken)).toBe(
        null,
      );

      hub.handle(a.gameId, owner.connection, {
        type: 'leave',
        id: '2',
      });
      expect(lastLobby(owner.messages)?.lobby).toMatchObject({
        hostPlayerId: null,
        players: [],
      });

      const back = hub.seatHost(a.gameId, host.id, 'Host');
      const c = hub.join(invite.pin, 'Guest');
      expect(
        store.listSeats(a.gameId).map((s) => s.player_id),
      ).toEqual([back.playerId, c.playerId]);
      hub.start(a.gameId, host.id);
      const late = listener(c.playerId);
      hub.connect(a.gameId, late.connection);
      hub.handle(a.gameId, late.connection, {
        type: 'leave',
        id: '3',
      });
      expect(late.messages.at(-1)).toMatchObject({
        type: 'error',
        message: 'You cannot leave once the game starts',
      });
    });
  });

  describe('idle cleanup', () => {
    const IDLE = 60_000;

    beforeEach(() => {
      vi.useFakeTimers();
      hub = new GameHub(store, 'test-secret', 'http://t', IDLE);
    });
    afterEach(() => {
      hub.dispose();
      vi.useRealTimers();
    });

    it('deletes a game once its last client has been gone a while', async () => {
      const { a, b } = await seatedGame(false);
      const first = hub.connect(
        a.gameId,
        listener(a.playerId).connection,
      );
      const second = hub.connect(
        a.gameId,
        listener(b.playerId).connection,
      );
      first();
      vi.advanceTimersByTime(IDLE * 2);
      expect(hub.exists(a.gameId)).toBe(true);

      second();
      vi.advanceTimersByTime(IDLE - 1);
      expect(hub.exists(a.gameId)).toBe(true);
      vi.advanceTimersByTime(1);
      expect(hub.exists(a.gameId)).toBe(false);
      expect(store.listSeats(a.gameId)).toEqual([]);
      expect(
        hub.authenticateSeat(a.gameId, a.seatToken),
      ).toBeNull();
    });

    it('keeps a game when a client reconnects within the grace period', async () => {
      const { a } = await seatedGame(false);
      hub.connect(a.gameId, listener(a.playerId).connection)();
      vi.advanceTimersByTime(IDLE - 1);
      hub.connect(a.gameId, listener(a.playerId).connection);
      vi.advanceTimersByTime(IDLE * 2);
      expect(hub.exists(a.gameId)).toBe(true);
    });

    it('cleans up games nobody opens, including ones stored before a restart', () => {
      const { gameId } = hub.createGame(host, {
        mode: 'classic',
        secretHoldings: false,
      });
      hub.dispose();
      const restarted = new GameHub(
        store,
        'test-secret',
        'http://t',
        IDLE,
      );
      vi.advanceTimersByTime(IDLE);
      expect(restarted.exists(gameId)).toBe(false);
      restarted.dispose();
    });
  });

  describe('table talk', () => {
    afterEach(() => vi.useRealTimers());

    it('broadcasts seated chat and replays it on connect', async () => {
      const { a, b } = await seatedGame(false);
      const owner = listener(a.playerId);
      const watcher = listener(null);
      hub.connect(a.gameId, owner.connection);
      hub.connect(a.gameId, watcher.connection);
      hub.handle(a.gameId, owner.connection, {
        type: 'chat',
        id: '1',
        text: 'Good luck!',
      });
      expect(owner.messages).toContainEqual({
        type: 'ack',
        id: '1',
      });
      const said = {
        type: 'chat',
        messages: [
          expect.objectContaining({
            playerId: a.playerId,
            text: 'Good luck!',
          }),
        ],
      };
      expect(watcher.messages.at(-1)).toEqual(said);

      hub.handle(a.gameId, watcher.connection, {
        type: 'chat',
        id: '2',
        text: 'heckle',
      });
      expect(watcher.messages.at(-1)).toMatchObject({
        type: 'error',
        message: 'Spectators cannot act',
      });

      const guest = listener(b.playerId);
      hub.connect(a.gameId, guest.connection);
      expect(guest.messages).toContainEqual(said);
    });

    it('rate-limits bursts of chat', async () => {
      vi.useFakeTimers();
      const { a } = await seatedGame(false);
      const owner = listener(a.playerId);
      hub.connect(a.gameId, owner.connection);
      const say = (id: string) =>
        hub.handle(a.gameId, owner.connection, {
          type: 'chat',
          id,
          text: 'spam',
        });
      ['1', '2', '3'].forEach(say);
      say('4');
      expect(owner.messages.at(-1)).toMatchObject({
        type: 'error',
        id: '4',
      });
      vi.advanceTimersByTime(2000);
      say('5');
      expect(owner.messages).toContainEqual({
        type: 'ack',
        id: '5',
      });
    });
  });
});
