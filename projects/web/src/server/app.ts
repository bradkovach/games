import type { WebSocket } from 'ws';

import {
  AngularNodeAppEngine,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import { existsSync } from 'node:fs';
import { ZodError } from 'zod';

import {
  AvatarsQuerySchema,
  ClientMessageSchema,
  CreateGameSchema,
  JoinRequestSchema,
  type ServerMessage,
} from '../shared/protocol';
import { currentUser, registerAuth } from './auth';
import { loadConfig, type ServerConfig } from './config';
import { Store } from './db';
import { type Connection, GameHub, HttpError } from './hub';

export interface AppOptions {
  /** Built browser bundle to serve statically, if present. */
  browserDistFolder?: string;
  config?: ServerConfig;
  /** Request logging; defaults to on. */
  logger?: boolean;
  /** Disable SSR (used by tests). */
  ssr?: boolean;
}

/** Builds the Fastify app. Storage opens lazily on first use. */
export function buildApp(
  options: AppOptions = {},
): FastifyInstance {
  const config = options.config ?? loadConfig();
  const app = Fastify({
    logger: options.logger === false ? false : { level: 'info' },
    trustProxy: true,
  });
  let hub: GameHub | undefined;
  let store: Store | undefined;
  const services = () => {
    store ??= new Store(config.dataDir);
    hub ??= new GameHub(store, config.secret, config.publicUrl);
    return { hub, store };
  };

  app.register(fastifyCookie, { secret: config.secret });
  app.register(fastifyWebsocket, {
    options: { maxPayload: 64 * 1024 },
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      return reply
        .code(error.status)
        .send({ error: error.message });
    }
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: 'Invalid request',
        issues: error.issues,
      });
    }
    const status = (error as { statusCode?: number }).statusCode;
    if (status && status < 500) {
      return reply
        .code(status)
        .send({ error: (error as Error).message });
    }
    request.log.error(error);
    return reply.code(500).send({ error: 'Internal error' });
  });

  app.register(async (scoped) => {
    registerAuth(scoped, config, (user) =>
      services().store.upsertUser(user),
    );

    scoped.post('/api/games', async (request, reply) => {
      const user = currentUser(request);
      if (!user)
        return reply.code(401).send({ error: 'Sign in first' });
      const { avatar, ...settings } = CreateGameSchema.parse(
        request.body ?? {},
      );
      return services().hub.createGame(user, settings, avatar);
    });

    scoped.post(
      '/api/games/:id/invites',
      async (request, reply) => {
        const user = currentUser(request);
        if (!user)
          return reply
            .code(401)
            .send({ error: 'Sign in first' });
        const { id } = request.params as { id: string };
        return services().hub.invite(id, user.id);
      },
    );

    scoped.post('/api/join', async (request) => {
      const body = JoinRequestSchema.parse(request.body);
      return services().hub.join(
        body.code,
        body.name,
        body.avatar,
      );
    });

    scoped.get('/api/join/avatars', async (request) => {
      const { code } = AvatarsQuerySchema.parse(request.query);
      return { taken: services().hub.avatarsTaken(code) };
    });

    scoped.get('/api/health', async () => {
      services().store.ping();
      return { ok: true };
    });

    scoped.get(
      '/ws/:id',
      { websocket: true },
      (socket, request) => {
        const { id } = request.params as { id: string };
        handleSocket(socket, id, services().hub);
      },
    );

    if (
      options.browserDistFolder &&
      existsSync(options.browserDistFolder)
    ) {
      await scoped.register(fastifyStatic, {
        index: false,
        maxAge: '1y',
        redirect: false,
        root: options.browserDistFolder,
        wildcard: false,
      });
    }
  });

  if (options.ssr !== false) {
    const angularApp = new AngularNodeAppEngine({
      allowedHosts: config.allowedHosts,
    });
    app.setNotFoundHandler(async (request, reply) => {
      const response = await angularApp.handle(request.raw);
      if (!response) {
        return reply.code(404).send({ error: 'Not found' });
      }
      reply.hijack();
      await writeResponseToNodeResponse(response, reply.raw);
    });
  }

  return app;
}

function handleSocket(
  socket: WebSocket,
  gameId: string,
  hub: GameHub,
) {
  if (!hub.exists(gameId)) {
    socket.close(4404, 'Game not found');
    return;
  }
  let connection: Connection | undefined;
  let disconnect: (() => void) | undefined;
  const send = (message: ServerMessage) => {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  };

  socket.on('message', (data) => {
    let json: unknown;
    try {
      json = JSON.parse(String(data));
    } catch {
      return socket.close(4400, 'Invalid JSON');
    }
    const parsed = ClientMessageSchema.safeParse(json);
    if (!parsed.success) {
      return send({
        type: 'error',
        id: '',
        message: 'Invalid message',
      });
    }
    const message = parsed.data;
    if (message.type === 'hello') {
      if (connection) return;
      let playerId: null | string = null;
      if (message.seatToken) {
        const seat = hub.authenticateSeat(
          gameId,
          message.seatToken,
        );
        if (!seat) return socket.close(4401, 'Invalid seat');
        playerId = seat.player_id;
      }
      connection = { playerId, send };
      disconnect = hub.connect(gameId, connection);
      return;
    }
    if (!connection)
      return socket.close(4401, 'Say hello first');
    hub.handle(gameId, connection, message);
  });

  socket.on('close', () => disconnect?.());
}
