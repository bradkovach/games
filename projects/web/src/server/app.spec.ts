import { buildApp } from './app';

describe('HTTP API', () => {
  const app = buildApp({
    config: {
      allowedHosts: ['localhost'],
      dataDir: ':memory:',
      oidc: {
        clientId: 'test',
        clientSecret: 'test',
        issuer: 'http://127.0.0.1:1/unused',
      },
      publicUrl: 'http://test',
      secret: 'test-secret',
    },
    logger: false,
    ssr: false,
  });

  afterAll(() => app.close());

  it('reports health', async () => {
    const health = await app.inject({ url: '/api/health' });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ ok: true });
  });

  it('rejects unknown avatars and invites', async () => {
    const avatar = await app.inject({
      body: { avatar: '🦄', code: '000-000-000', name: 'Eve' },
      method: 'POST',
      url: '/api/join',
    });
    expect(avatar.statusCode).toBe(400);
    const taken = await app.inject({
      url: '/api/join/avatars?code=000-000-000',
    });
    expect(taken.statusCode).toBe(400);
  });

  it('requires sign-in to host', async () => {
    const me = await app.inject({
      method: 'GET',
      url: '/api/me',
    });
    expect(me.statusCode).toBe(401);
    const create = await app.inject({
      body: { mode: 'classic' },
      method: 'POST',
      url: '/api/games',
    });
    expect(create.statusCode).toBe(401);
  });

  it('rejects bad invites and malformed requests', async () => {
    const badPin = await app.inject({
      body: { code: '000-000-000', name: 'Eve' },
      method: 'POST',
      url: '/api/join',
    });
    expect(badPin.statusCode).toBe(400);
    expect(badPin.json()).toEqual({
      error: 'Invite is invalid or expired',
    });
    const malformed = await app.inject({
      body: { code: '' },
      method: 'POST',
      url: '/api/join',
    });
    expect(malformed.statusCode).toBe(400);
  });

  it('lets only the host seat themselves and start', async () => {
    await app.ready();
    const as = (id: string) => ({
      cookie: `acq_session=${app.signCookie(
        JSON.stringify({ id, name: id }),
      )}`,
    });
    const { gameId } = (
      await app.inject({
        body: { mode: 'classic' },
        headers: as('owner'),
        method: 'POST',
        url: '/api/games',
      })
    ).json() as { gameId: string };

    const status = (who?: string) =>
      app.inject({
        headers: who ? as(who) : {},
        url: `/api/games/${gameId}/host`,
      });
    expect((await status('owner')).json()).toEqual({
      isHost: true,
    });
    expect((await status()).json()).toEqual({ isHost: false });

    const seat = (who: string) =>
      app.inject({
        body: { name: 'Owner' },
        headers: as(who),
        method: 'POST',
        url: `/api/games/${gameId}/seat`,
      });
    expect((await seat('intruder')).statusCode).toBe(403);
    const grant = await seat('owner');
    expect(grant.statusCode).toBe(200);
    expect(grant.json()).toMatchObject({ gameId });
    expect((await seat('owner')).statusCode).toBe(409);

    const start = (who: string) =>
      app.inject({
        headers: as(who),
        method: 'POST',
        url: `/api/games/${gameId}/start`,
      });
    expect((await start('intruder')).statusCode).toBe(403);
    const alone = await start('owner');
    expect(alone.statusCode).toBe(409);
  });

  it('closes sockets for unknown games', async () => {
    await app.ready();
    const socket = await app.injectWS('/ws/missing');
    const code = await new Promise<number>((resolve) =>
      socket.addEventListener('close', (e) => resolve(e.code)),
    );
    expect(code).toBe(4404);
  });
});
