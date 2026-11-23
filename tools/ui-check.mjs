// Headless-Chrome check of the player screen. Boots the built server
// (npm run build first) on a throwaway data dir, seats the host and a
// bot, plays the host's turns through the page on a phone viewport,
// and asserts layout behaviour. Screenshots go to OUT_DIR.
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

import { runBot, seedGame, sleep, startGame } from './seed.mjs';

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

async function main() {
  mkdirSync(OUT, { recursive: true });
  const { guests, host } = await seedGame({
    base: BASE,
    secret: SECRET,
  });
  // Slow enough that the host's screen is idle between turns.
  const bot = await runBot(BASE, guests[0], { delayMs: 1500 });
  await startGame(BASE, host);

  const browser = await chromium.launch({
    executablePath: CHROME,
  });
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
    await page.goto(`${BASE}${path || `/game/${host.gameId}`}`);
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
