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

  it('closes sockets for unknown games', async () => {
    await app.ready();
    const socket = await app.injectWS('/ws/missing');
    const code = await new Promise<number>((resolve) =>
      socket.addEventListener('close', (e) => resolve(e.code)),
    );
    expect(code).toBe(4404);
  });
});
