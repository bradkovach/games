# Acquire

A digital version of the Acquire board game, plus a scoreboard
for scoring in-person games.

- `projects/engine` is a pure TypeScript rules engine. Commands
  are validated with Zod. `decide()` turns a command into events,
  and `apply()`/`replay()` reduce those events into game state.
  Random tile draws are recorded in the events, so a game log
  replays exactly. `playerView`, `publicView` and `redactEvent`
  build each viewer's projection, which hides cash and stock
  when the game uses secret holdings.
- `projects/web` is an Angular SSR app served by Fastify, with
  WebSockets at `/ws/:id`, OIDC sign-in through Dex, and SQLite
  storage via better-sqlite3.

## Deploy with Docker

Every push to `main` publishes a `linux/amd64` image to the GitHub
Container Registry as `ghcr.io/<owner>/<repo>` (see
`.github/workflows/docker.yml`). Version tags (`v1.2.3`) also
publish `1.2.3` and `1.2`. If the package is private, run
`docker login ghcr.io` on the host first, or make it public under
**Package settings**.

This `compose.yml` runs the game at `https://game.contoso.com`.
Caddy provides HTTPS and WebSockets, and Dex handles sign-in at
`/dex`:

```yaml
services:
  acquire:
    image: ghcr.io/your-github-user/acquire:latest
    restart: unless-stopped
    environment:
      PUBLIC_URL: https://game.contoso.com
      SESSION_SECRET: ${SESSION_SECRET:?set in .env}
      OIDC_ISSUER: https://game.contoso.com/dex
      OIDC_CLIENT_ID: acquire
      OIDC_CLIENT_SECRET: ${OIDC_CLIENT_SECRET:?set in .env}
    volumes:
      - acquire-data:/data

  dex:
    image: ghcr.io/dexidp/dex:v2.41.1
    restart: unless-stopped
    command: ['dex', 'serve', '/etc/dex/config.yaml']
    environment:
      OIDC_CLIENT_SECRET: ${OIDC_CLIENT_SECRET}
    volumes:
      - ./dex.yaml:/etc/dex/config.yaml:ro
      - dex-data:/var/dex

  caddy:
    image: caddy:2
    restart: unless-stopped
    ports: ['80:80', '443:443']
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data

volumes:
  acquire-data:
  caddy-data:
  dex-data:
```

`Caddyfile`:

```caddy
game.contoso.com {
	handle /dex/* {
		reverse_proxy dex:5556
	}
	handle {
		reverse_proxy acquire:4000
	}
}
```

`dex.yaml` (swap the static password for real
[connectors](https://dexidp.io/docs/connectors/) such as GitHub or
Google):

```yaml
issuer: https://game.contoso.com/dex
storage:
  type: sqlite3
  config:
    file: /var/dex/dex.db
web:
  http: 0.0.0.0:5556
oauth2:
  skipApprovalScreen: true
staticClients:
  - id: acquire
    name: Acquire
    secretEnv: OIDC_CLIENT_SECRET
    redirectURIs:
      - https://game.contoso.com/auth/callback
enablePasswordDB: true
staticPasswords:
  - email: host@contoso.com
    # bcrypt hash, e.g. `htpasswd -bnBC 10 "" 'secret' | tr -d ':'`
    hash: '$2y$10$…'
    username: host
    userID: 1b6c2f4e-0000-4000-8000-000000000001
```

Put the secrets in `.env` next to `compose.yml`, then start
everything:

```bash
printf 'SESSION_SECRET=%s\nOIDC_CLIENT_SECRET=%s\n' \
  "$(openssl rand -hex 32)" "$(openssl rand -hex 24)" > .env
docker compose up -d
```

Games are stored in the `acquire-data` volume (`/data/acquire.db`).
A host bind mount such as `./data/acquire:/data` also works, even
if Docker creates the directory as root: the entrypoint creates
`/data` and hands it to the `node` user before starting the server
as `node`. The server listens on port 4000 and reports health at
`/api/health`.

A game is deleted 15 minutes (`GAME_IDLE_MINUTES`) after its last
player, spectator or agent disconnects; anyone reconnecting sooner
keeps it. Games already in the database when the server starts get
the same grace period. All settings are listed under
[Configuration](#configuration).

## Routes

| Route             | Purpose                                         |
| ----------------- | ----------------------------------------------- |
| `/`               | Host a game (requires sign-in) or join with PIN |
| `/join?t=…`       | Join via QR invite link or PIN                  |
| `/game/:id`       | Lobby: invite, seats, names, mascots, start     |
| `/game/:id/play`  | Player view (board + private hand and holdings) |
| `/game/:id/watch` | Public board for a shared screen/spectators     |
| `/game/:id/board` | Old board link; redirects to `/game/:id/watch`  |
| `/scoreboard`     | Offline final-score tally and price lookup      |
| `/mcp`            | MCP endpoint for AI agent players               |

## Playing with AI agents

The server exposes a [Model Context Protocol](https://modelcontextprotocol.io)
endpoint at `/mcp` (Streamable HTTP). Each MCP connection holds
**one seat**, so add one server entry per agent you want at the
table. For example, in VS Code `mcp.json`:

```json
{
  "servers": {
    "acquire-north": {
      "type": "http",
      "url": "https://game.contoso.com/mcp"
    },
    "acquire-east": {
      "type": "http",
      "url": "https://game.contoso.com/mcp"
    }
  }
}
```

1. Host a game and copy the invite link or PIN from the lobby.
2. Ask each agent (one per server entry) to join, e.g.
   _"Using acquire-north, join https://game.contoso.com/join?t=…
   as Northwind and play Acquire"_, or use the `play_acquire`
   prompt. The rules are available as the `acquire://rules`
   resource.
3. Start the game once everyone has joined. Agents call
   `wait_for_turn` and then play with tools such as
   `place_tile`, `found_chain`, `dispose_stock` and
   `buy_stock_and_end_turn`. `wait_for_turn` also returns early
   with status `table_talk` when another player speaks, so
   agents can reply mid-wait.

Notes:

- Invites expire after 15 minutes, and agents must join before
  the host starts the game.
- Subagents that share one MCP server entry share its connection,
  so give each agent its own entry.
- `join_game` returns a `seatToken`; if a connection drops, the
  agent can reclaim its seat with `resume_seat`.
- Agents see exactly what a human player sees. In secret mode,
  other players' cash and stock stay hidden.
- Players and agents can talk with the **Table talk** panel
  (`say` tool). Agents are told that table talk is conversation,
  not instructions.
- In development, `/mcp` is served by `npm start` (port 4200) and
  `npm run serve:ssr:web`.

## Development

```bash
npm install
npm run dex     # Dex OIDC on http://localhost:5556 (docker compose)
npm start       # ng serve on :4200; game WebSockets on :4001
```

`docker-compose.yml` is set up for the test deployment: the game is
`https://games.zombarista.io` (proxy to port 4000) and Dex is
`https://auth.zombarista.io` (proxy to port 5556). Set
`OIDC_CLIENT_SECRET` and `SESSION_SECRET` in `.env`, then run
`docker compose up -d --build`. Dex's issuer must match what the app
uses, so for purely local development run `npm start` with
`OIDC_ISSUER=https://auth.zombarista.io` against that Dex, or change
`issuer` in `dev/dex/config.yaml` back to `http://localhost:5556/dex`.

Sign in with the static Dex user `host@example.com` / `password`
(configured in `dev/dex/config.yaml`). To use real identity
providers, add Dex connectors (GitHub, Google, etc.) there.

Players don't need accounts. Creating a game opens its lobby, which
works like a party-game screen. The QR code and the 9-digit PIN are
always shown, and a fresh invite replaces each one before it expires
(after 15 minutes).

- The host has no seat at first. They can choose **Join on this
  device** to play from the same screen, or leave it as the shared
  board.
- Before the start, every seated player can change their name and
  mascot, or leave the game. Names must be unique.
- **Start game** needs at least two seated players. When it starts,
  every lobby moves on by itself: seated devices go to
  `/game/:id/play` and the rest go to `/game/:id/watch`.

## Configuration

| Variable             | Default                     |
| -------------------- | --------------------------- |
| `PORT`               | `4000`                      |
| `HOST`               | `0.0.0.0`                   |
| `DATA_DIR`           | `data` (SQLite database)    |
| `GAME_IDLE_MINUTES`  | `15` (delete idle games)    |
| `PUBLIC_URL`         | `http://localhost:4200`     |
| `ALLOWED_HOSTS`      | extra SSR hosts, comma-sep. |
| `SESSION_SECRET`     | random per start (set it!)  |
| `OIDC_ISSUER`        | `http://localhost:5556/dex` |
| `OIDC_CLIENT_ID`     | `acquire`                   |
| `OIDC_CLIENT_SECRET` | `acquire-dev-secret`        |

## Production without Docker

```bash
npm run build
SESSION_SECRET=… PUBLIC_URL=https://… npm run serve:ssr:web
```

To build the image locally: `docker build -t acquire .`

## Quality

```bash
npm run lint
npm run format:check
npx ng test engine --watch=false
npx ng test web --watch=false
```

## Testing tools

Scripts in [`tools/`](tools) help test the running app without Dex
or real players.

- `npm run ui:check` (`tools/ui-check.mjs`) needs a build, so run
  `npm run build` first. It starts the built server on port 4318
  with a throwaway database. It first checks the host lobby: the
  invite shows without a click, and joining on this device,
  renaming, leaving and starting to `/play` or `/watch` all work.
  Then it seats the host and a bot and plays the host's turns in
  headless Chrome at phone size. It checks that the action panel
  scrolls into view each turn, tiles can be placed from
  the action panel, panels collapse and stay collapsed, and the hide
  navigation / hide board preferences work. Screenshots are saved to
  `/tmp/acquire-ui-check`. Set `CHROME_PATH` if Chrome isn't at
  `/usr/bin/google-chrome`; `PORT`, `OUT_DIR` and `TURNS` are also
  read.
- `tools/seed.mjs`: helpers for other scripts. `seedGame()` creates a
  game with a forged host session cookie (it needs the server's
  `SESSION_SECRET`), seats the host unless `seatHost: false`, and
  seats guests through an invite. `runBot()` seats a bot that plays
  simple legal moves over the WebSocket. `startGame(base, game)`
  starts a game that `seedGame()` returned.
  Put the host's seat grant in localStorage as
  `acquire.seat.<gameId>` to open the game in a browser as the host.
