import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  type ChainId,
  ChainIdSchema,
  type CommandInput,
  CommandSchema,
  legalMoves,
  TileIdSchema,
} from 'engine';
import { z } from 'zod';

import type { GameHub } from '../hub';

import { AVATARS, isAvatar } from '../../shared/avatars';
import { CHAT_MAX } from '../../shared/protocol';
import { AgentSeat } from './agent-seat';
import { logLines, names, renderSnapshot } from './render';
import { PLAY_PROMPT, RULES_MARKDOWN } from './rules';

/** Per-connection state: at most one seat. */
export interface AgentSession {
  seat?: AgentSeat;
  /** Whether a response has already shown the game as started. */
  shownStarted?: boolean;
}

const WAIT_DEFAULT_SECONDS = 45;
const WAIT_MAX_SECONDS = 50;

const StatusSchema = z.enum([
  'game_over',
  'game_started',
  'lobby',
  'table_talk',
  'waiting',
  'your_turn',
]);
type Status = z.infer<typeof StatusSchema>;

const OutputSchema = {
  chat: z.array(
    z.object({ from: z.string(), text: z.string() }),
  ),
  gameId: z.string(),
  log: z.array(z.string()),
  moves: z.record(z.string(), z.unknown()).nullable(),
  phase: z.string(),
  playerId: z.string(),
  seatToken: z.string().optional(),
  status: StatusSchema,
  view: z.record(z.string(), z.unknown()).nullable(),
};

/** Builds the MCP server for one agent connection. */
export function createAgentServer(
  hub: GameHub,
  session: AgentSession,
): McpServer {
  const server = new McpServer(
    { name: 'acquire', title: 'Acquire', version: '1.0.0' },
    {
      instructions:
        'Play the board game Acquire. Join with join_game using an invite link or PIN from the host, then loop on wait_for_turn and the action tools. Each MCP connection holds one seat. Rules: acquire://rules.',
    },
  );

  const fail = (message: string): CallToolResult => ({
    content: [{ type: 'text', text: message }],
    isError: true,
  });

  const needSeat = () => {
    if (!session.seat) {
      throw new Error(
        'You have no seat yet. Call join_game (or resume_seat) first.',
      );
    }
    return session.seat;
  };

  const status = (seat: AgentSeat): Status => {
    const { lobby, view } = seat;
    if (view?.phase.kind === 'gameOver') return 'game_over';
    if (view && legalMoves(view).myTurn) return 'your_turn';
    if (!lobby?.started) return 'lobby';
    return 'waiting';
  };

  const report = (
    seat: AgentSeat,
    extra: {
      prefix?: string;
      seatToken?: string;
      status?: Status;
    } = {},
  ): CallToolResult => {
    const { lobby, view } = seat;
    session.shownStarted = seat.lobby?.started ?? false;
    const shown = extra.status ?? status(seat);
    const news = seat.takeNews();
    const moves = view ? legalMoves(view) : null;
    const nameMap = names(lobby);
    const text = renderSnapshot({
      chat: news.chat,
      events: news.events,
      lobby,
      moves,
      playerId: seat.playerId,
      view,
    });
    const structured = {
      chat: news.chat.map((m) => ({
        from: nameMap.get(m.playerId) ?? 'Someone',
        text: m.text,
      })),
      gameId: seat.gameId,
      log: logLines(news.events, nameMap),
      moves: moves as null | Record<string, unknown>,
      phase: view?.phase.kind ?? 'notStarted',
      playerId: seat.playerId,
      seatToken: extra.seatToken,
      status: shown,
      view: view as null | Record<string, unknown>,
    };
    return {
      content: [
        {
          type: 'text',
          text: [
            extra.prefix,
            `Status: ${shown}`,
            STATUS_HINTS[shown],
            text,
          ]
            .filter(Boolean)
            .join('\n\n'),
        },
      ],
      structuredContent: structured,
    };
  };

  const guarded =
    <A>(
      run: (
        args: A,
        signal: AbortSignal,
      ) => CallToolResult | Promise<CallToolResult>,
    ) =>
    async (
      args: A,
      extra: { signal: AbortSignal },
    ): Promise<CallToolResult> => {
      try {
        return await run(args, extra.signal);
      } catch (error) {
        return fail((error as Error).message);
      }
    };

  const command = (input: CommandInput): CallToolResult => {
    const seat = needSeat();
    const parsed = CommandSchema.safeParse(input);
    if (!parsed.success) {
      return fail(
        parsed.error.issues.map((i) => i.message).join('; '),
      );
    }
    const outcome = seat.act({
      type: 'command',
      command: parsed.data,
    });
    if (!outcome.ok) {
      const result = report(seat, {
        prefix: `That move was rejected: ${outcome.error}${rejectionHint(seat)}`,
      });
      return { content: result.content, isError: true };
    }
    return report(seat);
  };

  const seated = (seat: AgentSeat) => {
    session.seat?.close();
    session.shownStarted = false;
    session.seat = seat;
  };

  server.registerResource(
    'rules',
    'acquire://rules',
    {
      description: 'A concise summary of the rules of Acquire',
      mimeType: 'text/markdown',
      title: 'Acquire rules',
    },
    (uri) => ({
      contents: [
        {
          mimeType: 'text/markdown',
          text: RULES_MARKDOWN,
          uri: uri.href,
        },
      ],
    }),
  );

  server.registerPrompt(
    'play_acquire',
    {
      argsSchema: {
        invite: z
          .string()
          .describe('Invite link or PIN from the host'),
        name: z.string().describe('Your name at the table'),
      },
      description: 'Join a game and play it to the end',
      title: 'Play Acquire',
    },
    ({ invite, name }) => ({
      messages: [
        {
          content: {
            type: 'text',
            text: PLAY_PROMPT(invite, name),
          },
          role: 'user',
        },
      ],
    }),
  );

  server.registerTool(
    'join_game',
    {
      description:
        'Take a seat in a game that has not started yet, using the invite link (https://…/join?t=…) or the 9-digit PIN shown by the host. Returns a seatToken for resume_seat. One seat per MCP connection.',
      inputSchema: {
        avatar: z
          .string()
          .optional()
          .describe(
            `Mascot, by name or symbol: ${AVATARS.map((a) => a.name).join(', ')}`,
          ),
        invite: z.string().min(1).max(1024),
        name: z.string().trim().min(1).max(40),
      },
      outputSchema: OutputSchema,
      title: 'Join a game',
    },
    guarded(
      ({
        avatar,
        invite,
        name,
      }: {
        avatar?: string;
        invite: string;
        name: string;
      }) => {
        if (
          session.seat &&
          session.seat.view?.phase.kind !== 'gameOver'
        ) {
          return fail(
            'This connection already holds a seat in a game that is not over. Each MCP connection plays one seat; add another server entry to seat another player.',
          );
        }
        const glyph = avatar ? resolveAvatar(avatar) : undefined;
        if (avatar && !glyph) {
          return fail(
            `Unknown avatar "${avatar}". Choose one of: ${AVATARS.map((a) => a.name).join(', ')}`,
          );
        }
        const code = inviteCode(invite);
        let grant;
        try {
          grant = hub.join(code, name, glyph);
        } catch (error) {
          const message = (error as Error).message;
          if (/avatar/i.test(message)) {
            const taken = new Set(hub.avatarsTaken(code));
            const free = AVATARS.filter(
              (a) => !taken.has(a.glyph),
            )
              .map((a) => a.name)
              .join(', ');
            return fail(`${message}. Still free: ${free}`);
          }
          return fail(message);
        }
        const seat = new AgentSeat(
          hub,
          grant.gameId,
          grant.playerId,
        );
        seated(seat);
        return report(seat, {
          prefix: `You joined as ${name}. Your seatToken is ${grant.seatToken} — keep it secret; call resume_seat with it if this connection is lost. Now call wait_for_turn.`,
          seatToken: grant.seatToken,
        });
      },
    ),
  );

  server.registerTool(
    'resume_seat',
    {
      description:
        'Reclaim a seat you joined earlier (for example after the MCP connection was restarted).',
      inputSchema: {
        gameId: z.string().min(1).max(64),
        seatToken: z.string().min(1).max(128),
      },
      outputSchema: OutputSchema,
      title: 'Resume a seat',
    },
    guarded(
      ({
        gameId,
        seatToken,
      }: {
        gameId: string;
        seatToken: string;
      }) => {
        const row = hub.exists(gameId)
          ? hub.authenticateSeat(gameId, seatToken)
          : null;
        if (!row)
          return fail('That game or seat token is not valid.');
        seated(new AgentSeat(hub, gameId, row.player_id));
        return report(session.seat!, {
          prefix: 'Seat resumed.',
        });
      },
    ),
  );

  server.registerTool(
    'get_state',
    {
      annotations: { readOnlyHint: true },
      description:
        'Show the board, your hand, cash and stock, chains, players, your legal moves, and anything new in the log or table talk.',
      outputSchema: OutputSchema,
      title: 'Look at the table',
    },
    (extra) =>
      guarded(() => report(needSeat()))(undefined, extra),
  );

  server.registerTool(
    'wait_for_turn',
    {
      annotations: { readOnlyHint: true },
      description: `Wait until you must act (status your_turn), the game starts (game_started) or ends (game_over), or another player says something (table_talk: reply with say if you like, then wait again). Returns status "waiting" after the timeout; just call it again. Also returns what other players did meanwhile.`,
      inputSchema: {
        timeoutSeconds: z
          .number()
          .int()
          .min(1)
          .max(WAIT_MAX_SECONDS)
          .default(WAIT_DEFAULT_SECONDS),
      },
      outputSchema: OutputSchema,
      title: 'Wait for your turn',
    },
    guarded(
      async (
        { timeoutSeconds }: { timeoutSeconds?: number },
        signal,
      ) => {
        const seat = needSeat();
        let result: Status = 'waiting';
        const ready = () => {
          const now = status(seat);
          if (now === 'game_over' || now === 'your_turn') {
            result = now;
            return true;
          }
          if (!session.shownStarted && seat.lobby?.started) {
            result = 'game_started';
            return true;
          }
          if (seat.hasFreshTalk()) {
            result = 'table_talk';
            return true;
          }
          return false;
        };
        const seconds = timeoutSeconds ?? WAIT_DEFAULT_SECONDS;
        await seat.until(ready, seconds * 1000, signal);
        return report(seat, { status: result });
      },
    ),
  );

  const tool = <S extends z.ZodRawShape>(
    name: string,
    title: string,
    description: string,
    inputSchema: S,
    toCommand: (args: z.infer<z.ZodObject<S>>) => CommandInput,
  ) =>
    server.registerTool(
      name,
      {
        description,
        inputSchema,
        outputSchema: OutputSchema,
        title,
      },
      guarded((args: z.infer<z.ZodObject<S>>) =>
        command(toCommand(args)),
      ) as never,
    );

  tool(
    'place_tile',
    'Place a tile',
    'Place one of your playable tiles on the board.',
    {
      tile: TileIdSchema.describe(
        'A tile from your hand, e.g. "5C"',
      ),
    },
    ({ tile }) => ({ type: 'placeTile', tile }),
  );
  tool(
    'pass_placement',
    'Pass placement',
    'Skip placing a tile; only allowed when none of your tiles is playable.',
    {},
    () => ({ type: 'passPlacement' }),
  );
  tool(
    'found_chain',
    'Found a chain',
    'Choose which hotel chain to found with the tile you just placed.',
    { chain: ChainIdSchema },
    ({ chain }) => ({ type: 'foundChain', chain }),
  );
  tool(
    'choose_survivor',
    'Choose merger survivor',
    'In a merger between equally large chains, choose the one that survives.',
    { chain: ChainIdSchema },
    ({ chain }) => ({ type: 'chooseSurvivor', chain }),
  );
  tool(
    'choose_acquired',
    'Choose next acquired chain',
    'In a multi-chain merger with tied sizes, choose which chain is acquired next.',
    { chain: ChainIdSchema },
    ({ chain }) => ({ type: 'chooseAcquired', chain }),
  );
  tool(
    'dispose_stock',
    'Sell, trade or keep stock',
    'Decide what to do with your shares of the chain being acquired: sell some at its price, trade an even number 2-for-1 for survivor shares, and keep the rest.',
    {
      sell: z.number().int().min(0).max(25).default(0),
      trade: z.number().int().min(0).max(25).default(0),
    },
    ({ sell, trade }) => ({ type: 'disposeStock', sell, trade }),
  );
  tool(
    'buy_stock_and_end_turn',
    'Buy stock and end turn',
    'Buy up to 3 shares in active chains (or none) and end your turn. Dead tiles are swapped automatically unless discardDead is false.',
    {
      discardDead: z.boolean().default(true),
      purchases: z
        .partialRecord(
          ChainIdSchema,
          z.number().int().min(0).max(3),
        )
        .default({})
        .describe(
          'Shares to buy per chain, e.g. {"tower": 2, "imperial": 1}',
        ),
    },
    ({ discardDead, purchases }) => ({
      type: 'endTurn',
      discardDead,
      purchases,
    }),
  );
  server.registerTool(
    'declare_game_end',
    {
      description:
        'Declare that the game ends after this turn (only when a chain has 41+ tiles or all chains are safe). If you have already placed your tile, this also buys the given shares (or none) and ends your turn, so no further call is needed.',
      inputSchema: {
        discardDead: z.boolean().default(true),
        purchases: z
          .partialRecord(
            ChainIdSchema,
            z.number().int().min(0).max(3),
          )
          .default({}),
      },
      outputSchema: OutputSchema,
      title: 'Declare the game over',
    },
    guarded(
      ({
        discardDead,
        purchases,
      }: {
        discardDead: boolean;
        purchases: Partial<Record<ChainId, number>>;
      }) => {
        const declared = command({ type: 'declareEnd' });
        if (declared.isError) return declared;
        const phase = session.seat?.view?.phase;
        if (phase?.kind !== 'buyStock') return declared;
        return command({
          type: 'endTurn',
          discardDead,
          purchases,
        });
      },
    ) as never,
  );

  server.registerTool(
    'say',
    {
      description:
        'Say something short to everyone at the table (table talk). Keep it friendly; never reveal your hand or seat token.',
      inputSchema: {
        text: z.string().trim().min(1).max(CHAT_MAX),
      },
      title: 'Table talk',
    },
    guarded(({ text }: { text: string }) => {
      const seat = needSeat();
      const outcome = seat.act({ type: 'chat', text });
      return outcome.ok
        ? { content: [{ type: 'text', text: 'Said.' }] }
        : fail(outcome.error);
    }),
  );

  return server;
}

/** What to do next, by status; shown under the status line. */
const STATUS_HINTS: Record<Status, string> = {
  game_over: 'The game is over. Final results are below.',
  game_started:
    'The game has started, but it is not your turn yet. Call wait_for_turn.',
  lobby: '',
  table_talk:
    'Someone spoke at the table (see "Table talk" below). It is not your turn. Reply with say if you like, then call wait_for_turn.',
  waiting:
    'It is not your turn. Call wait_for_turn again; do not call action tools until the status is your_turn.',
  your_turn:
    'It is your turn. Call exactly one tool from "Your options".',
};

/** Accepts a full invite link, a bare token or a PIN. */
export function inviteCode(invite: string): string {
  const trimmed = invite.trim();
  try {
    const token = new URL(trimmed).searchParams.get('t');
    if (token) return token;
  } catch {
    // Not a URL: a PIN or a raw token.
  }
  return trimmed;
}

/** Explains a rejection caused by acting out of turn. */
function rejectionHint(seat: AgentSeat): string {
  const view = seat.view;
  if (!view) return '';
  const { phase } = view;
  if (!('playerId' in phase) || phase.playerId === view.me.id) {
    return '';
  }
  const name =
    seat.lobby?.players.find((p) => p.id === phase.playerId)
      ?.name ?? 'another player';
  return ` It is ${name}'s decision now, not yours; call wait_for_turn and act only when its status is your_turn.`;
}

function resolveAvatar(value: string): string | undefined {
  const trimmed = value.trim().replace(/\uFE0F/g, '');
  if (isAvatar(trimmed)) return trimmed;
  return AVATARS.find(
    (a) => a.name.toLowerCase() === trimmed.toLowerCase(),
  )?.glyph;
}
