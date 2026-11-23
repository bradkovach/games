import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from 'fastify';

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'node:crypto';

import type { GameHub } from '../hub';

import { type AgentSession, createAgentServer } from './server';

export interface McpOptions {
  /** Host names the endpoint answers for (DNS-rebinding guard). */
  allowedHosts: string[];
  hub: () => GameHub;
  idleMs?: number;
  maxSessions?: number;
}

interface Entry {
  close(): void;
  lastSeen: number;
  transport: StreamableHTTPServerTransport;
}

const IDLE_MS = 2 * 60 * 60 * 1000;
const MAX_SESSIONS = 64;

/** Mounts the hosted MCP endpoint (Streamable HTTP) at `/mcp`. */
export function registerMcp(
  app: FastifyInstance,
  options: McpOptions,
): void {
  const sessions = new Map<string, Entry>();
  const idleMs = options.idleMs ?? IDLE_MS;
  const maxSessions = options.maxSessions ?? MAX_SESSIONS;

  const sweep = setInterval(
    () => {
      const cutoff = Date.now() - idleMs;
      for (const entry of sessions.values()) {
        if (entry.lastSeen < cutoff) entry.close();
      }
    },
    Math.min(idleMs, 60_000),
  );
  sweep.unref();
  app.addHook('onClose', async () => {
    clearInterval(sweep);
    for (const entry of [...sessions.values()]) entry.close();
  });

  const open = (): Entry => {
    const session: AgentSession = {};
    const server = createAgentServer(options.hub(), session);
    let id: string | undefined;
    let closed = false;
    const transport: StreamableHTTPServerTransport =
      new StreamableHTTPServerTransport({
        onsessioninitialized: (sid) => {
          id = sid;
          sessions.set(sid, entry);
        },
        sessionIdGenerator: randomUUID,
      });
    const entry: Entry = {
      close: () => {
        if (closed) return;
        closed = true;
        if (id) sessions.delete(id);
        // The seat stays in the game; only this connection ends.
        session.seat?.close();
        void server.close();
      },
      lastSeen: Date.now(),
      transport,
    };
    transport.onclose = entry.close;
    void server.connect(transport);
    return entry;
  };

  const handler = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    if (!originAllowed(request, options.allowedHosts)) {
      return reply
        .code(403)
        .send(rpcError(-32000, 'Host or origin not allowed'));
    }
    const header = request.headers['mcp-session-id'];
    const sessionId = typeof header === 'string' ? header : '';
    let entry = sessionId ? sessions.get(sessionId) : undefined;
    if (!entry) {
      if (sessionId) {
        return reply
          .code(404)
          .send(rpcError(-32001, 'Session not found'));
      }
      if (
        request.method !== 'POST' ||
        !isInitializeRequest(request.body)
      ) {
        return reply
          .code(400)
          .send(rpcError(-32000, 'Initialize a session first'));
      }
      if (sessions.size >= maxSessions) {
        return reply
          .code(503)
          .send(rpcError(-32000, 'Too many agent sessions'));
      }
      entry = open();
    }
    entry.lastSeen = Date.now();
    reply.hijack();
    await entry.transport.handleRequest(
      request.raw,
      reply.raw,
      request.body,
    );
  };

  app.post('/mcp', handler);
  app.get('/mcp', handler);
  app.delete('/mcp', handler);
}

function originAllowed(
  request: FastifyRequest,
  allowedHosts: string[],
): boolean {
  if (!allowedHosts.includes(request.hostname)) return false;
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    return allowedHosts.includes(new URL(origin).hostname);
  } catch {
    return false;
  }
}

function rpcError(code: number, message: string) {
  return { id: null, error: { code, message }, jsonrpc: '2.0' };
}
