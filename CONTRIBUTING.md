# Contributing to Crafterm

Thanks for your interest in improving Crafterm! This is a macOS Electron app
(TypeScript). The notes below should get you productive quickly.

## Development setup

```bash
npm install     # installs deps + rebuilds node-pty for Electron (postinstall)
npm run dev     # run the app with hot reload
```

Requirements: macOS, Node.js 18+, and Xcode Command Line Tools
(`xcode-select --install`) for the native `node-pty` build.

## Before opening a pull request

1. **Typecheck both configs** (the build does not typecheck):
   ```bash
   npx tsc --noEmit -p tsconfig.web.json
   npx tsc --noEmit -p tsconfig.node.json
   ```
2. **Run the unit tests** (Vitest):
   ```bash
   npx vitest run
   ```
3. **Build**:
   ```bash
   npm run build
   ```
4. **Run the app** (`npm run dev`) and exercise the feature you changed.

CI runs steps 1–3 on every pull request.

New behavior needs a test. Tests live under `src/tests/`:

- `src/tests/unit/` — Vitest. Pure logic and stores run in `node`; anything that
  touches the DOM opts into happy-dom with a `// @vitest-environment happy-dom`
  docblock at the top of the file.
- `src/tests/e2e/` — Playwright, driving the real Electron build (`npm run e2e`).
  Slower; run it when you change a user-facing flow.

## Code style

- **TypeScript strict mode.** Avoid `any`; prefer precise types and `unknown` +
  narrowing.
- **English only** in all committed code: identifiers, strings, comments,
  log/error messages, and commit messages.
- No file headers; modules start directly with imports.
- Comments describe what the code does, not its history (no `// REMOVED:` /
  `// NEW:` changelog comments).
- `camelCase` for variables/functions, `UpperCamelCase` for types, boolean props
  start with `is`/`has`/`should`.

## The three layers

- **`src/views/`** — the renderer. gea `.tsx` components (no React). It never
  touches Node or Electron; it calls a service client. See
  [`docs/views-architecture.md`](docs/views-architecture.md) for the component
  file structure (`.tsx` + `.store.ts` + `.css`), which is enforced by guard tests.
- **`src/services/<domain>/`** — the IPC layer, one folder per domain.
- **`src/core/`** — the main process: anything that touches the OS (node-pty, the
  filesystem, the `git` / `gh` / `docker` CLIs, windows, notifications).

## Adding an IPC call

Three edits in lockstep — every channel is registered centrally, so a name or
payload-type drift fails at compile time:

1. A channel entry in `src/services/channels.ts` (the typed registry)
2. A `handle` / `on` in `src/services/<domain>/<domain>.main.ts`
3. A `call` / `send` / `listen` wrapper in `src/services/<domain>/<domain>.client.ts`

The renderer imports the client wrapper — never the preload bridge directly. A
guard test fails the build if a main-side module leaks into the renderer, or vice
versa.

If the value is persisted, also add it to `SavedState` in
`src/repositories/state.types.ts` and migrate old shapes on read.

## Commits & pull requests

- Use [Conventional Commits](https://www.conventionalcommits.org/):
  `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`. Short, imperative
  subject.
- Every PR description should include: a one-line summary, what changed and why,
  and how you tested it.
- Keep PRs focused; unrelated changes belong in separate PRs.

## Reporting bugs & requesting features

Use the GitHub issue templates. For security issues, see
[SECURITY.md](SECURITY.md) — please do **not** open a public issue.
