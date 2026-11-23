// Seeds games on a running Acquire server without Dex, and drives
// bot players over the WebSocket protocol. Shared by the tools in
// this directory (see "Testing tools" in the README).
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { sign } = require('@fastify/cookie');

/** Forges a host session cookie, signed with SESSION_SECRET. */
export function hostCookie(
  secret,
  user = { id: 'host1', name: 'Hana' },
) {
  const value = sign(JSON.stringify(user), secret);
  return `acq_session=${encodeURIComponent(value)}`;
}

async function post(base, url, body, headers = {}) {
  const res = await fetch(base + url, {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...headers },
    method: 'POST',
  });
  const json = await res.json();
  if (!res.ok)
    throw new Error(`${url}: ${JSON.stringify(json)}`);
  return json;
}

/**
 * Creates a game as the host and seats `guests` through an invite.
 * Returns seat grants ({ gameId, playerId, seatToken }); the host's
 * grant can be put in localStorage as `acquire.seat.<gameId>`.
 */
export async function seedGame({
  base,
  guests = ['Bob'],
  secret,
  settings = {},
}) {
  const cookie = hostCookie(secret);
  const host = await post(base, '/api/games', settings, {
    cookie,
  });
  const invite = await post(
    base,
    `/api/games/${host.gameId}/invites`,
    {},
    { cookie },
  );
  const seats = [];
  for (const name of guests) {
    seats.push(
      await post(base, '/api/join', { code: invite.pin, name }),
    );
  }
  return { guests: seats, host, invite };
}

/** Opens a seated WebSocket; `onState` gets every state message. */
export function connect(base, grant, onState = () => {}) {
  const ws = new WebSocket(
    `${base.replace(/^http/, 'ws')}/ws/${grant.gameId}`,
  );
  let n = 0;
  const send = (message) =>
    ws.send(JSON.stringify({ id: `m${n++}`, ...message }));
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (message.type === 'state') onState(message, send);
  });
  return new Promise((resolve, reject) => {
    ws.addEventListener('error', reject);
    ws.addEventListener('open', () => {
      ws.send(
        JSON.stringify({
          type: 'hello',
          seatToken: grant.seatToken,
        }),
      );
      resolve({ close: () => ws.close(), send });
    });
  });
}

/** Starts the game from the host's seat. */
export async function startGame(base, host) {
  const socket = await connect(base, host);
  await sleep(300);
  socket.send({ type: 'start' });
  await sleep(300);
  socket.close();
}

/** A simple legal move: first playable tile, no purchases. */
export function simpleMove(view) {
  const { phase } = view;
  switch (phase.kind) {
    case 'buyStock':
      return {
        type: 'endTurn',
        discardDead: true,
        purchases: {},
      };
    case 'chooseAcquired':
      return {
        type: 'chooseAcquired',
        chain: phase.candidates[0],
      };
    case 'chooseSurvivor':
      return {
        type: 'chooseSurvivor',
        chain: phase.candidates[0],
      };
    case 'disposeStock':
      return { type: 'disposeStock', sell: 0, trade: 0 };
    case 'foundChain':
      return {
        type: 'foundChain',
        chain: view.chains.find((c) => !c.active).chain,
      };
    case 'placeTile': {
      const tile = view.me.hand.find(
        (t) => t.status === 'playable',
      );
      return tile
        ? { type: 'placeTile', tile: tile.tile }
        : { type: 'passPlacement' };
    }
    default:
      return null;
  }
}

/** Seats a bot that answers its own turns after `delayMs`. */
export function runBot(
  base,
  grant,
  { delayMs = 300, move = simpleMove } = {},
) {
  let lastSeq = -1;
  return connect(base, grant, ({ seq, view }, send) => {
    if (view.phase?.playerId !== grant.playerId) return;
    if (seq === lastSeq) return;
    lastSeq = seq;
    const command = move(view);
    if (command) {
      setTimeout(
        () => send({ type: 'command', command }),
        delayMs,
      );
    }
  });
}

export const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));
