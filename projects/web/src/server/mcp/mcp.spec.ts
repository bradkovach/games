import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { LegalMoves, PlayerView } from 'engine';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { legalMoves } from 'engine';

import type {
  InviteInfo,
  SeatGrant,
  ServerMessage,
} from '../../shared/protocol';
import type { GameHub } from '../hub';
import type { AgentSeat } from './agent-seat';

import { buildApp } from '../app';
import { createAgentServer } from './server';

interface Structured {
  chat: { from: string; text: string }[];
  gameId: string;
  moves: LegalMoves | null;
  playerId: string;
  seatToken?: string;
  status: string;
  view: null | PlayerView;
}

/** The first legal move, as a tool call. */
function firstMove(moves: LegalMoves): [string, object] {
  if (moves.place?.length)
    return ['place_tile', { tile: moves.place[0].tile }];
  if (moves.pass) return ['pass_placement', {}];
  if (moves.found)
    return ['found_chain', { chain: moves.found[0] }];
  if (moves.pickSurvivor)
    return ['choose_survivor', { chain: moves.pickSurvivor[0] }];
  if (moves.pickAcquired)
    return ['choose_acquired', { chain: moves.pickAcquired[0] }];
  if (moves.dispose)
    return [
      'dispose_stock',
      { sell: moves.dispose.owned, trade: 0 },
    ];
  const buy = moves.buy?.chains[0];
  return [
    'buy_stock_and_end_turn',
    { purchases: buy ? { [buy.chain]: 1 } : {} },
  ];
}

const TOOL_COMMANDS: Record<string, string> = {
  buy_stock_and_end_turn: 'endTurn',
  choose_acquired: 'chooseAcquired',
  choose_survivor: 'chooseSurvivor',
  dispose_stock: 'disposeStock',
  found_chain: 'foundChain',
  pass_placement: 'passPlacement',
  place_tile: 'placeTile',
};

describe('MCP endpoint', () => {
  const app = buildApp({
    config: {
      allowedHosts: ['127.0.0.1', 'localhost'],
      dataDir: ':memory:',
      oidc: {
        clientId: 'test',
        clientSecret: 'test',
        issuer: 'http://127.0.0.1:1/unused',
      },
      publicUrl: 'http://127.0.0.1',
      secret: 'test-secret',
    },
    logger: false,
    ssr: false,
  });
  let base = '';
  const clients: Client[] = [];

  beforeAll(async () => {
    await app.listen({ host: '127.0.0.1', port: 0 });
    const address = app.server.address();
    if (typeof address !== 'object' || !address)
      throw new Error('no address');
    base = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await Promise.all(clients.map((c) => c.close()));
    await app.close();
  });

  async function agent(): Promise<Client> {
    const client = new Client({ name: 'test', version: '1' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${base}/mcp`)),
    );
    clients.push(client);
    return client;
  }

  async function call(
    client: Client,
    name: string,
    args: object = {},
  ): Promise<{
    error: boolean;
    structured: Structured;
    text: string;
  }> {
    const result = (await client.callTool({
      arguments: args as Record<string, unknown>,
      name,
    })) as CallToolResult;
    const text = result.content
      .map((c) => (c.type === 'text' ? c.text : ''))
      .join('\n');
    return {
      error: result.isError === true,
      structured:
        result.structuredContent as unknown as Structured,
      text,
    };
  }

  async function hostGame(): Promise<{
    grant: SeatGrant;
    invite: InviteInfo;
  }> {
    const cookie = `acq_session=${app.signCookie(
      JSON.stringify({ id: 'host-user', name: 'Host' }),
    )}`;
    const grant = (await (
      await fetch(`${base}/api/games`, {
        body: JSON.stringify({ secretHoldings: true }),
        headers: { 'content-type': 'application/json', cookie },
        method: 'POST',
      })
    ).json()) as SeatGrant;
    const invite = (await (
      await fetch(`${base}/api/games/${grant.gameId}/invites`, {
        headers: { cookie },
        method: 'POST',
      })
    ).json()) as InviteInfo;
    return { grant, invite };
  }

  it('lets several agents join, chat and play with private views', async () => {
    const { grant, invite } = await hostGame();
    const north = await agent();
    const east = await agent();

    const tools = (await north.listTools()).tools.map(
      (t) => t.name,
    );
    expect(tools).toEqual(
      expect.arrayContaining([
        'join_game',
        'wait_for_turn',
        'place_tile',
        'buy_stock_and_end_turn',
        'say',
      ]),
    );

    const joinedNorth = await call(north, 'join_game', {
      avatar: 'Sailboat',
      invite: invite.url,
      name: 'North',
    });
    expect(joinedNorth.error).toBe(false);
    expect(joinedNorth.structured.status).toBe('lobby');
    const taken = await call(east, 'join_game', {
      avatar: '⛵',
      invite: invite.pin,
      name: 'East',
    });
    expect(taken.error).toBe(true);
    expect(taken.text).toMatch(/already taken\. Still free: /);
    const joinedEast = await call(east, 'join_game', {
      invite: invite.pin,
      name: 'East',
    });
    expect(joinedEast.error).toBe(false);
    const again = await call(east, 'join_game', {
      invite: invite.pin,
      name: 'East again',
    });
    expect(again.error).toBe(true);
    expect(again.text).toMatch(/already holds a seat/);

    // The human host starts the game and plays over the WebSocket.
    const socket = await app.injectWS(`/ws/${grant.gameId}`);
    let hostView: null | PlayerView = null;
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(
        String((event as MessageEvent).data),
      ) as ServerMessage;
      if (message.type === 'state')
        hostView = message.view as PlayerView;
    });
    socket.send(
      JSON.stringify({
        type: 'hello',
        seatToken: grant.seatToken,
      }),
    );
    socket.send(JSON.stringify({ type: 'start', id: 'start' }));

    const started = await call(north, 'wait_for_turn', {
      timeoutSeconds: 5,
    });
    expect(['game_started', 'your_turn']).toContain(
      started.structured.status,
    );

    expect(
      (await call(east, 'say', { text: 'Good luck!' })).error,
    ).toBe(false);
    const heard = await call(north, 'get_state');
    expect(heard.structured.chat).toContainEqual({
      from: 'East',
      text: 'Good luck!',
    });
    expect(heard.text).toContain('[table talk] ');

    const agents = new Map([
      [joinedEast.structured.playerId, east],
      [joinedNorth.structured.playerId, north],
    ]);
    let hostCounter = 0;
    let agentMoves = 0;
    for (let step = 0; step < 60 && agentMoves < 8; step++) {
      await vi.waitFor(() => expect(hostView).not.toBeNull());
      const view = hostView as unknown as PlayerView;
      const phase = view.phase;
      if (!('playerId' in phase)) break;
      const client = agents.get(phase.playerId);
      if (!client) {
        const [tool, args] = firstMove(legalMoves(view));
        const before = hostView;
        socket.send(
          JSON.stringify({
            type: 'command',
            id: `h${++hostCounter}`,
            command: { type: TOOL_COMMANDS[tool], ...args },
          }),
        );
        await vi.waitFor(() =>
          expect(hostView).not.toBe(before),
        );
        continue;
      }
      const turn = await call(client, 'wait_for_turn', {
        timeoutSeconds: 5,
      });
      expect(turn.structured.status).toBe('your_turn');
      const { moves, view: mine } = turn.structured;
      // Secret holdings: no opponent totals, only my own hand.
      for (const p of mine!.players) {
        if (p.id !== mine!.me.id) {
          expect(p.cash).toBeUndefined();
          expect(p.stock).toBeUndefined();
        }
      }
      expect(mine!.me.id).toBe(phase.playerId);
      const [tool, args] = firstMove(moves!);
      const before = hostView;
      const result = await call(client, tool, args);
      expect(result.error).toBe(false);
      agentMoves++;
      await vi.waitFor(() => expect(hostView).not.toBe(before));
    }
    expect(agentMoves).toBeGreaterThanOrEqual(4);

    const { phase: now } = hostView as unknown as PlayerView;
    const current = 'playerId' in now ? now.playerId : '';
    const idle = [...agents].find(([id]) => id !== current)![1];
    const rejected = await call(idle, 'place_tile', {
      tile: '1A',
    });
    expect(rejected.error).toBe(true);
    expect(rejected.text).toMatch(/That move was rejected: /);
    expect(rejected.text).toMatch(/decision now, not yours/);
    expect(rejected.text).toMatch(
      /# Not your turn\. Waiting for /,
    );

    // Table talk wakes a waiting agent so it can reply.
    const waiting = call(idle, 'wait_for_turn', {
      timeoutSeconds: 5,
    });
    await new Promise((r) => setTimeout(r, 100));
    socket.send(
      JSON.stringify({ type: 'chat', id: 'hi', text: 'Hello?' }),
    );
    const woke = await waiting;
    expect(woke.structured.status).toBe('table_talk');
    expect(woke.structured.chat).toContainEqual({
      from: 'Host',
      text: 'Hello?',
    });

    const resumed = await agent();
    const back = await call(resumed, 'resume_seat', {
      gameId: grant.gameId,
      seatToken: joinedNorth.structured.seatToken,
    });
    expect(back.error).toBe(false);
    expect(back.structured.playerId).toBe(
      joinedNorth.structured.playerId,
    );
    socket.close();
  }, 20_000);

  it('refuses requests without a session or from foreign hosts', async () => {
    const orphan = await fetch(`${base}/mcp`, {
      body: JSON.stringify({
        id: 1,
        jsonrpc: '2.0',
        method: 'tools/list',
      }),
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
      },
      method: 'POST',
    });
    expect(orphan.status).toBe(400);
    const foreign = await fetch(`${base}/mcp`, {
      body: '{}',
      headers: {
        'content-type': 'application/json',
        origin: 'https://evil.example',
      },
      method: 'POST',
    });
    expect(foreign.status).toBe(403);
  });
});

describe('join_game with an existing seat', () => {
  async function joinWith(phase: string): Promise<string> {
    const hub = {
      join: () => {
        throw new Error('Invite is invalid or expired');
      },
    } as unknown as GameHub;
    const seat = {
      close: () => undefined,
      view: { phase: { kind: phase } },
    } as unknown as AgentSeat;
    const server = createAgentServer(hub, { seat });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test', version: '1' });
    await Promise.all([server.connect(a), client.connect(b)]);
    const result = (await client.callTool({
      arguments: { invite: '123456789', name: 'Again' },
      name: 'join_game',
    })) as CallToolResult;
    await client.close();
    const first = result.content[0];
    return first.type === 'text' ? first.text : '';
  }

  it('refuses while the seated game is still running', async () => {
    expect(await joinWith('buy')).toMatch(
      /already holds a seat/,
    );
  });

  it('allows a new game once the seated game is over', async () => {
    expect(await joinWith('gameOver')).toMatch(
      /Invite is invalid/,
    );
  });
});
