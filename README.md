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

## Routes

| Route             | Purpose                                         |
| ----------------- | ----------------------------------------------- |
| `/`               | Host a game (requires sign-in) or join with PIN |
| `/join?t=…`       | Join via QR invite link or PIN                  |
| `/game/:id`       | Player view (board + private hand and holdings) |
| `/game/:id/board` | Public board for a shared screen/spectators     |
| `/scoreboard`     | Offline final-score tally and price lookup      |

## Development

```bash
npm install
npm run dex     # Dex OIDC on http://localhost:5556 (docker compose)
npm start       # ng serve on :4200; game WebSockets on :4001
```

Sign in with the static Dex user `host@example.com` / `password`
(configured in `dev/dex/config.yaml`). To use real identity
providers, add Dex connectors (GitHub, Google, etc.) there.

Players don't need accounts. The host opens the lobby, clicks
**Invite players** and shares the QR code or the 9-digit PIN.
Invites expire after 15 minutes.

## Configuration

| Variable             | Default                     |
| -------------------- | --------------------------- |
| `PORT`               | `4000`                      |
| `HOST`               | `0.0.0.0`                   |
| `DATA_DIR`           | `data` (SQLite database)    |
| `PUBLIC_URL`         | `http://localhost:4200`     |
| `ALLOWED_HOSTS`      | extra SSR hosts, comma-sep. |
| `SESSION_SECRET`     | random per start (set it!)  |
| `OIDC_ISSUER`        | `http://localhost:5556/dex` |
| `OIDC_CLIENT_ID`     | `acquire`                   |
| `OIDC_CLIENT_SECRET` | `acquire-dev-secret`        |

## Production

```bash
npm run build
SESSION_SECRET=… PUBLIC_URL=https://… npm run serve:ssr:web
```

## Quality

```bash
npm run lint
npm run format:check
npx ng test engine --watch=false
npx ng test web --watch=false
```
