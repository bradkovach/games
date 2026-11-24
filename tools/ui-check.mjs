// Headless-Chrome check of the lobby and player screen. Boots the
// built server (npm run build first) on a throwaway data dir, checks
// the host lobby (invite, join on this device, rename, leave, start),
// then seats the host and a bot, plays the host's turns through the
// page on a phone viewport, and asserts layout behaviour.
// Screenshots go to OUT_DIR.
//
//   node tools/ui-check.mjs
//
// Env: CHROME_PATH (default /usr/bin/google-chrome), PORT (4318),
// OUT_DIR (/tmp/acquire-ui-check), TURNS (host turns to play, 6).
import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

import {
  connect,
  runBot,
  seedGame,
  sleep,
  startGame,
} from './seed.mjs';

const CHROME =
  process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const PORT = Number(process.env.PORT ?? 4318);
const OUT = process.env.OUT_DIR ?? '/tmp/acquire-ui-check';
const TURNS = Number(process.env.TURNS ?? 6);
const SERVER = 'dist/web/server/server.mjs';
const SECRET = 'ui-check';
const BASE = `http://127.0.0.1:${PORT}`;

const failures = [];
function check(ok, message) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${message}`);
  if (!ok) failures.push(message);
}

async function bootServer() {
  if (!existsSync(SERVER)) {
    throw new Error(`${SERVER} is missing; run npm run build`);
  }
  const dataDir = mkdtempSync(join(tmpdir(), 'acquire-ui-'));
  const server = spawn('node', [SERVER], {
    env: {
      ...process.env,
      DATA_DIR: dataDir,
      HOST: '127.0.0.1',
      PORT: String(PORT),
      PUBLIC_URL: BASE,
      SESSION_SECRET: SECRET,
    },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) break;
    } catch {
      // Not listening yet.
    }
    await sleep(200);
  }
  return () => {
    server.kill();
    rmSync(dataDir, { force: true, recursive: true });
  };
}

/** Opens a game's lobby as its signed-in host, with no seat. */
async function hostLobby(browser, game) {
  const context = await browser.newContext({
    viewport: { height: 900, width: 1280 },
  });
  const [name, value] = game.cookie.split(/=(.*)/);
  await context.addCookies([{ name, url: BASE, value }]);
  const page = await context.newPage();
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto(`${BASE}/game/${game.gameId}`);
  await page.waitForSelector('.players');
  return page;
}

const playerNames = (page) =>
  page.$$eval('.players li', (items) =>
    items.map((li) =>
      li.textContent.replace(/\s+/g, ' ').trim(),
    ),
  );

async function waitFor(predicate, timeout = 5000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await predicate()) return true;
    await sleep(100);
  }
  return false;
}

async function checkLobby(browser) {
  const game = await seedGame({
    base: BASE,
    guests: ['Gus', 'Ivy'],
    seatHost: false,
    secret: SECRET,
  });
  const page = await hostLobby(browser, game);
  await page.waitForSelector('.pin', { timeout: 5000 });
  check(
    /^\d{3}-\d{3}-\d{3}$/.test(await page.textContent('.pin')) &&
      (await page.$('img.qr')) !== null,
    'lobby shows the PIN and QR without a click',
  );
  await page.screenshot({ path: `${OUT}/lobby-host.png` });

  await page.fill('.seat input[name=name]', 'Hana');
  await page.click('.seat button[type=submit]');
  check(
    await waitFor(async () =>
      (await playerNames(page)).some((n) =>
        /Hana \(host\) \(you\)/.test(n),
      ),
    ),
    'join on this device seats the host',
  );

  await page.fill('.you input[name=name]', 'Captain');
  await page.click('.you button[type=submit]');
  check(
    await waitFor(async () =>
      (await playerNames(page)).some((n) =>
        n.includes('Captain'),
      ),
    ),
    'renaming updates the player list',
  );

  await page.click('.you button.leave');
  check(
    await waitFor(
      async () =>
        (await page.$('.seat')) !== null &&
        !(await playerNames(page)).some((n) =>
          n.includes('Captain'),
        ),
    ),
    'host can leave and is offered the seat again',
  );

  const gus = await connect(BASE, game.guests[0]);
  await sleep(200);
  gus.send({ type: 'leave' });
  check(
    await waitFor(
      async () =>
        !(await playerNames(page)).some((n) =>
          n.includes('Gus'),
        ),
    ),
    "a guest leaving updates the host's lobby",
  );
  gus.close();

  await page.fill('.seat input[name=name]', 'Hana');
  await page.click('.seat button[type=submit]');
  await page.waitForSelector('.you');
  await page.click('button.start');
  check(
    await waitFor(() => page.url().endsWith('/play')),
    'seated host starts into the player screen',
  );
  await page.context().close();

  const board = await seedGame({
    base: BASE,
    guests: ['Gus', 'Ivy'],
    seatHost: false,
    secret: SECRET,
  });
  const boardPage = await hostLobby(browser, board);
  await boardPage.click('button.start');
  check(
    await waitFor(() => boardPage.url().endsWith('/watch')),
    'unseated host starts into the board view',
  );
  await boardPage.waitForSelector('.frame');
  await boardPage.context().close();
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: CHROME,
  });
  await checkLobby(browser);

  const game = await seedGame({
    base: BASE,
    secret: SECRET,
  });
  const { guests, host } = game;
  // Slow enough that the host's screen is idle between turns.
  const bot = await runBot(BASE, guests[0], { delayMs: 1500 });
  await startGame(BASE, game);

  async function open(viewport, prefs = {}, path = '') {
    const context = await browser.newContext({ viewport });
    await context.addInitScript(
      ([key, grant, entries]) => {
        localStorage.setItem(key, grant);
        for (const [k, v] of Object.entries(entries)) {
          localStorage.setItem(k, v);
        }
      },
      [
        `acquire.seat.${host.gameId}`,
        JSON.stringify(host),
        prefs,
      ],
    );
    const page = await context.newPage();
    await page.goto(
      `${BASE}${path || `/game/${host.gameId}/play`}`,
    );
    if (!path) await page.waitForSelector('.frame');
    return page;
  }
  const phone = { height: 844, width: 390 };
  const wide = { height: 900, width: 1440 };

  // Play the host's turns on a phone, from the action panel.
  const page = await open(phone);
  let played = 0;
  let tilesFromPanel = 0;
  while (played < TURNS) {
    if (!(await page.$('.actions.attention'))) {
      await page.evaluate(() => {
        const side = document.querySelector('.side');
        side.scrollTop = side.scrollHeight;
      });
      await page.waitForSelector('.actions.attention', {
        timeout: 20000,
      });
      await sleep(1200);
      const r = await page.evaluate(() => {
        const side = document.querySelector('.side');
        const panel = document.querySelector('.actions');
        return {
          offset:
            panel.getBoundingClientRect().top -
            side.getBoundingClientRect().top,
          scrollable: side.scrollHeight > side.clientHeight,
        };
      });
      check(
        !r.scrollable || Math.abs(r.offset) < 4,
        `turn ${played + 1}: actions scrolled into view ` +
          `(offset ${Math.round(r.offset)}px)`,
      );
      played++;
    }
    const tile = await page.$('.hand button:not([disabled])');
    if (tile) {
      await tile.click();
      tilesFromPanel++;
    } else if (await page.$('.actions button.chip')) {
      await page.click('.actions button.chip');
    } else if (await page.$('table.dispose')) {
      await page.click('.actions p button:not(.secondary)');
    } else if (await page.$('text=End turn')) {
      await page.click('text=End turn');
    } else if (await page.$('text=No playable tile')) {
      await page.click('text=No playable tile');
    }
    await sleep(800);
  }
  check(
    tilesFromPanel > 0,
    'tiles placed from the action panel',
  );
  await page.screenshot({ path: `${OUT}/phone.png` });

  await page.click('app-panel >> text=Log');
  const collapsed = await page
    .waitForSelector('app-log-panel', {
      state: 'detached',
      timeout: 3000,
    })
    .then(() => true)
    .catch(() => false);
  check(collapsed, 'log panel collapses');
  await page.reload();
  await page.waitForSelector('.frame');
  check(
    (await page.$('app-log-panel')) === null,
    'collapsed state survives a reload',
  );

  const noNav = await open(phone, { 'acquire.hideNav': 'true' });
  check(
    (await noNav.$('.topbar')) === null,
    'nav hidden in game',
  );
  await noNav.screenshot({ path: `${OUT}/phone-no-nav.png` });
  const home = await open(
    phone,
    { 'acquire.hideNav': 'true' },
    '/',
  );
  check(
    (await home.$('.topbar')) !== null,
    'nav still shown off the game screen',
  );

  const prefs = { 'acquire.hideBoard': 'true' };
  const noBoard = await open(phone, prefs);
  check(
    (await noBoard.$('app-board')) === null,
    'board hidden on phone',
  );
  await noBoard.screenshot({
    path: `${OUT}/phone-no-board.png`,
  });
  const wideNoBoard = await open(wide, prefs);
  const columns = await wideNoBoard.evaluate(
    () =>
      getComputedStyle(
        document.querySelector('.side'),
      ).gridTemplateColumns.split(' ').length,
  );
  check(columns === 2, 'wide no-board layout has two columns');
  await wideNoBoard.screenshot({
    path: `${OUT}/wide-no-board.png`,
  });
  await (
    await open(wide)
  ).screenshot({ path: `${OUT}/wide.png` });

  await browser.close();
  bot.close();
}

const stop = await bootServer();
try {
  await main();
} catch (error) {
  failures.push(String(error));
  console.error(error);
} finally {
  stop();
}
console.log(
  failures.length
    ? `${failures.length} check(s) failed`
    : `All checks passed; screenshots in ${OUT}`,
);
process.exit(failures.length ? 1 : 0);
