# Agent notes

Angular 22 workspace for a digital Acquire board game. See
[README.md](README.md) for running, configuration and deployment.

## Layout

- `projects/engine`: event-sourced game engine (Zod commands, pure
  reducer, per-player redacted views).
- `projects/web`: Angular SSR app served by Fastify, with game
  WebSockets, Dex OIDC sign-in, SQLite storage and an MCP server at
  `/mcp` for AI players.
- `tools`: scripts for testing the running app (see below).

## Commands

```bash
npx ng test engine --watch=false
npx ng test web --watch=false     # one file: --include='**/x.spec.ts'
npx ng build engine               # after engine changes
npm run build                     # web app (SSR server in dist/web)
npm run lint && npm run format:check
npm run ui:check                  # after npm run build
```

## Conventions

- Prettier: 2-space indent, 65-column print width. ESLint uses
  perfectionist `recommended-natural`, which sorts class members and
  object keys. Class field initializers therefore run in sorted
  order, not the order you wrote them: never make one field's
  initializer depend on another field.
- Component CSS can't contain `//` comments.
- Preferences are per browser (localStorage keys `acquire.*`) via
  `PreferencesService`; they are never sent to the server.

## Testing tools

- `tools/ui-check.mjs` (`npm run ui:check`): starts the built server
  on a throwaway database and checks the player screen in headless
  Chrome (system Chrome via `playwright-core`; set `CHROME_PATH` if
  needed). Extend it when changing frame layout, preferences or the
  action panel. Screenshots go to `/tmp/acquire-ui-check`.
- `tools/seed.mjs`: `seedGame`, `runBot`, `startGame`, `connect` for
  scripting games against a server you started with a known
  `SESSION_SECRET`.

When you build a testing helper that proves useful, put it in
`tools/` and document it here and in the README.
