import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from 'fastify';

import * as oidc from 'openid-client';
import { z } from 'zod';

import type { Me } from '../shared/protocol';
import type { ServerConfig } from './config';

import { HttpError } from './hub';

const SESSION_COOKIE = 'acq_session';
const LOGIN_COOKIE = 'acq_oidc';

const LoginStateSchema = z.object({
  returnTo: z.string(),
  state: z.string(),
  verifier: z.string(),
});

const MeSchema = z.object({
  email: z.string().optional(),
  id: z.string(),
  name: z.string(),
});

export function currentUser(request: FastifyRequest): Me | null {
  const raw = request.cookies[SESSION_COOKIE];
  if (!raw) return null;
  const unsigned = request.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) return null;
  const parsed = MeSchema.safeParse(safeJson(unsigned.value));
  return parsed.success ? parsed.data : null;
}

/** OIDC login against Dex (or any OIDC provider). */
export function registerAuth(
  app: FastifyInstance,
  config: ServerConfig,
  onLogin: (user: Me) => void,
): void {
  const secure = config.publicUrl.startsWith('https:');
  const redirectUri = `${config.publicUrl}/auth/callback`;
  let discovered: Promise<oidc.Configuration> | undefined;

  const client = () => {
    discovered ??= oidc
      .discovery(
        new URL(config.oidc.issuer),
        config.oidc.clientId,
        config.oidc.clientSecret,
        undefined,
        config.oidc.issuer.startsWith('http:')
          ? { execute: [oidc.allowInsecureRequests] }
          : undefined,
      )
      .catch((error: unknown) => {
        discovered = undefined;
        app.log.error(error, 'OIDC discovery failed');
        throw new HttpError(
          503,
          'Sign-in provider is unavailable',
        );
      });
    return discovered;
  };

  const cookieOptions = (maxAge: number) => ({
    httpOnly: true,
    maxAge,
    path: '/',
    sameSite: 'lax' as const,
    secure,
    signed: true,
  });

  app.get('/auth/login', async (request, reply) => {
    const query = request.query as { returnTo?: string };
    const returnTo = safeReturnTo(query.returnTo);
    const verifier = oidc.randomPKCECodeVerifier();
    const state = oidc.randomState();
    const url = oidc.buildAuthorizationUrl(await client(), {
      code_challenge:
        await oidc.calculatePKCECodeChallenge(verifier),
      code_challenge_method: 'S256',
      redirect_uri: redirectUri,
      scope: 'openid email profile',
      state,
    });
    reply.setCookie(
      LOGIN_COOKIE,
      JSON.stringify({ returnTo, state, verifier }),
      cookieOptions(600),
    );
    return reply.redirect(url.href);
  });

  app.get('/auth/callback', async (request, reply) => {
    const raw = request.cookies[LOGIN_COOKIE];
    const unsigned = raw ? request.unsignCookie(raw) : undefined;
    const login = LoginStateSchema.safeParse(
      unsigned?.valid ? safeJson(unsigned.value ?? '') : null,
    );
    if (!login.success) return failLogin(reply, 'Login expired');
    reply.clearCookie(LOGIN_COOKIE, { path: '/' });
    try {
      const tokens = await oidc.authorizationCodeGrant(
        await client(),
        new URL(request.url, config.publicUrl),
        {
          expectedState: login.data.state,
          pkceCodeVerifier: login.data.verifier,
        },
      );
      const claims = tokens.claims();
      if (!claims)
        return failLogin(reply, 'No identity returned');
      const email =
        typeof claims['email'] === 'string'
          ? claims['email']
          : undefined;
      const name =
        typeof claims['name'] === 'string'
          ? claims['name']
          : (email ?? 'Host');
      const user: Me = { email, id: claims.sub, name };
      onLogin(user);
      reply.setCookie(
        SESSION_COOKIE,
        JSON.stringify(user),
        cookieOptions(60 * 60 * 24 * 30),
      );
      return reply.redirect(login.data.returnTo);
    } catch (error) {
      request.log.warn({ error }, 'OIDC callback failed');
      return failLogin(reply, 'Login failed');
    }
  });

  app.post('/auth/logout', async (_request, reply) => {
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/me', async (request, reply) => {
    const user = currentUser(request);
    return (
      user ?? reply.code(401).send({ error: 'Not signed in' })
    );
  });
}

function failLogin(reply: FastifyReply, message: string) {
  return reply.redirect(
    `/?error=${encodeURIComponent(message)}`,
  );
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/** Only allow same-site relative redirects. */
function safeReturnTo(value: string | undefined): string {
  return value?.startsWith('/') && !value.startsWith('//')
    ? value
    : '/';
}
