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
The container runs as the `node` user, listens on port 4000, and
reports health at `/api/health`. All settings are listed under
[Configuration](#configuration).

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
