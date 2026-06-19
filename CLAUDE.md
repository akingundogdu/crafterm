# Crafterm — macOS Terminal Manager (Electron + TypeScript)

## What This App Does

**Crafterm** — a cmux-style macOS terminal manager: split-pane terminals, a
project/folder sidebar, command/worktree/SSH/Claude pickers, an in-app notebook,
a right-side notification + reminders + files + time panel, per-pane theming, and
pop-out windows.

This is the **active, shipping app**. It is built with Electron + xterm.js +
node-pty (TypeScript). Work happens here, in `src/`.

- **Feature spec (behavior reference):** `docs/features.md`.
- **Backlog / workflow:** `~/.crafterm/todo-list.json` (used in both dev and
  production builds — not `~/.crafterm-dev/`). Statuses: Backlog → In progress →
  Ready to test → Done. Implement Backlog items easiest-first, move each finished
  one to **Ready to test**; the user verifies and moves it to **Done**. When the
  user asks for a "todo check" or to work the backlog, read this JSON file
  directly — the old `todo-list.md` in the repo is deprecated.

## Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript 5 (strict), ESNext modules, `Bundler` resolution |
| Runtime | Electron 33 (macOS), single app process + renderer(s) |
| Build/dev | **electron-vite** (Vite 5); `electron-builder` for packaging |
| Terminal UI | **xterm.js** (`@xterm/xterm` + `@xterm/addon-fit`) |
| PTY | **node-pty** (native; externalized from the bundle, rebuilt via electron-rebuild) |
| Renderer UI | **Vanilla TS + DOM** — no UI framework. Styles in `src/renderer/src/style.css` |
| Markdown | hand-written renderer in `src/renderer/src/markdown.ts` (→ HTML string) |
| Browser pane | Electron `<webview>` tag (the only web-content surface) |
| Persistence | JSON at `~/.crafterm/crafterm-state.json` (dev: `~/.crafterm-dev/`); notebooks + bundled sounds under the same dir / app resources |

## Build, Run & Verify

```bash
npm run dev          # electron-vite dev (hot reload) — run the app
npm run build        # bundle main + preload + renderer into out/
npm run dist         # electron-builder package (dmg + zip)
npm run dist:dir     # unpacked build (faster, for local testing)
npm run rebuild      # rebuild the node-pty native module against Electron
```

`electron-vite build` does **not** typecheck. Typecheck explicitly:

```bash
npx tsc --noEmit -p tsconfig.web.json    # renderer + preload
npx tsc --noEmit -p tsconfig.node.json   # main + preload
```

**Verification:** there is currently **no test framework** in this repo. Verify a
change with: (1) `npx tsc --noEmit` on both configs, (2) `npm run build`, then
(3) `npm run dev` and exercise the feature in the running app. Adding a test
framework is a new dependency — propose it and get approval first.

**NEVER kill the running app without asking first.** Do not run `kill`, `pkill`,
`killall`, or otherwise terminate a running Crafterm / Electron / `npm run dev`
process the user has open — not even a dev instance you started yourself for a
smoke test. The user may be actively using it. If a launched process must be
stopped, ask first and wait for an explicit OK.

## Process Model

- **Main / model** (`src/core/`): bootstrap `src/core/index.ts` registers every
  controller, owns the `BrowserWindow`(s) + pop-out windows, native `Notification`s,
  and the app menu; the domain models (`services/terminal.manager`, `git`/`fs`/
  `claude` services, `db`/`docker`, `windows`, `domain`) live under `src/core/`.
  Anything that touches the OS (spawn shells, read the filesystem, `afplay`, `git`,
  the `gh`/`docker` CLIs) lives here.
- **Controllers** (`src/services/<domain>/`): each domain is one folder with
  `<domain>.main.ts` (registers handlers via the typed `handle`/`on`/`emit` helpers
  in `services/channels.main.ts`), `<domain>.client.ts` (renderer wrappers via
  `call`/`send`/`listen` in `services/channels.client.ts`), and `<domain>.types.ts`
  (shared request/response/data shapes). **Adding an IPC call = three edits:** a
  channel entry in **`src/services/channels.ts`** (the central typed registry) → a
  `handle`/`on` in `<domain>.main.ts` → a `call`/`send`/`listen` wrapper in
  `<domain>.client.ts`. Both sides reference only the registry, so a channel-name
  or req/res type drift fails at compile time. A grep guard
  (`tests/.../cross-process.guard.test.ts`) blocks a `*.main.ts` from leaking into
  the renderer (or `*.client.ts`/`window` into main).
- **Preload** (`src/core/bridge/index.ts`): a generic `contextBridge` exposing
  `window.crafterm.{invoke,send,on}` — an untyped pass-through over the registry;
  the `*.client.ts` wrappers are its only callers (they supply the typed channel +
  payload).
- **Renderer / view** (`src/ui/*`): the UI. No Node/Electron APIs directly — always
  go through the `@services` client wrappers (never `window.crafterm` raw).

## Architecture (renderer)

- **Manager / hooks pattern, not a framework.** `state.ts` holds the single source
  of truth as live singletons (`panes`, `browsers`, `docs`, `state`, `settings`,
  `notifications`) that modules import and mutate in place.
- **Render orchestration** goes through `hooks` + coalesced requests
  (`requestSidebar()` / `requestStatuses()` / `renderContent()` /
  `renderNotifications()`), batched on `requestAnimationFrame`. Don't re-render
  the whole UI; call the narrowest hook.
- **Break import cycles** via the indirection objects in `state.ts`
  (`hooks`, `paneActions`) — wire real implementations in `main.ts`. Cross-module
  calls used only inside functions (not at module top-level) are fine.
- Keep one responsibility per module; extract shared UI into helpers
  (`dialog.ts`) rather than duplicating.

### Module map (`src/renderer/src/`)

| File | Responsibility |
|---|---|
| `state.ts` | singletons, `settings`, persistence (`persist`/`loadSettings`/`saveSoon`), `hooks`, `pushNotification` |
| `types.ts` | shared TS types (LayoutNode, Pane, SidebarNode, Reminder, AppNotification, …) |
| `main.ts` | entry: wires DOM buttons, global keybindings, and the `hooks`/`paneActions` implementations |
| `commands.ts` | high-level actions: create/split/close panes, `openLink`, `openNote`, `openMarkdownFile`, worktree/git, … |
| `pane.ts` | terminal pane lifecycle (xterm), doc + browser panes, activity detection & notifications |
| `content.ts` | split-tree → DOM, per-tab container cache (tabs flip `display`, never detach) |
| `sidebar.ts` | terminal + notebook sidebar (tree render, drag-drop, inline rename, details) |
| `notebook.ts` | notebook tree (`<stateDir>/notebooks`) + linked external files |
| `notifications.ts` | right panel: Alerts / Reminders / Files / Time tabs + cards |
| `reminders.ts` | reminders, past reminders, snooze |
| `explorer.ts` / `time.ts` | file explorer + time tracking (right-panel tabs) |
| `pickers.ts` | modal pickers/finders (command palette, project, worktree, SSH, Claude, md/file finders) |
| `settings.ts` | settings modal |
| `markdown.ts` | markdown → HTML |
| `themes.ts`, `palette-seed.ts`, `keybindings.ts`, `dialog.ts`, `tree.ts`, `popout.ts` | theming, palette seed, key handling, modal helpers, pure tree algorithms, pop-out window |

## Universal Rules

- **English only** in all committed code: identifiers, strings, log/error messages,
  commit messages, comments. No Turkish (or any other language). (User-facing
  planning docs like `todo-list.md` may be in the user's language.)
- **Concise responses.** Short answers, no preamble, no trailing summaries.
- **Never bypass git hooks** (`--no-verify`, `--no-gpg-sign`). A hook failure means
  the code is broken — fix the root cause.
- **Commit/push only when asked.** Never commit to the default branch — branch
  first. Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`,
  `test:`), short imperative subject.
- **No proactive `.md` files.** Don't create README/SUMMARY/EXPLANATION docs unless
  asked. (`docs/features.md`, `todo-list.md`, and this file are the intentional,
  user-requested exceptions.)
- **No changelog comments in code** (`// REMOVED:`, `// NEW:`, `// FIXED:`).
  Comments describe what code does, not its history.
- **Ask before adding any dependency.** Never commit secrets or `.env`; never log
  PII/credentials.

## TypeScript Conventions

- **Strict mode.** Avoid `any`; prefer precise types and `unknown` + narrowing.
- Prefer `if let`-style guards: `if (!x) return`, optional chaining `?.`,
  nil-coalescing `??`. Use `try/catch` for error paths; return `null`/`false` from
  IPC handlers on failure (the established main-process idiom).
- **Non-null assertion (`!`)** is used *only* for statically-present
  `document.getElementById(...)` elements declared in `index.html`. Do **not** use
  `!` to paper over values that can legitimately be null at runtime.
- **No file headers** — modules start directly with imports (match the existing
  files).
- **Naming:** `camelCase` for variables/functions, `UpperCamelCase` for
  types/interfaces, boolean props start with `is`/`has`/`should`. Descriptive
  names; `pty`, `cwd`, `ansi` are accepted domain abbreviations.

## Assets & Constants — Centralized

- **Colors / theme** via CSS custom properties in `style.css` (`var(--accent)`,
  `var(--text-dim)`, …) — never inline hex in `.ts` where a variable exists.
- **Icons** are inline SVG string constants at the top of their module (e.g.
  `FOLDER_SVG`, `NOTE_SVG`) — reuse, don't re-inline.
- **Filesystem paths** are resolved in the **main** process; never hardcode
  absolute paths in the renderer. Unavoidable system paths (`/bin/zsh`,
  `/usr/bin/afplay`, git) stay in the main process only.

## Persistence

- The renderer owns app state and saves it debounced (300ms, `saveSoon()` in
  `state.ts`); `persistNow()` flushes synchronously on quit.
- Adding a persisted setting requires four edits in lockstep: the field on
  `settings` (`state.ts`), the `persist()` payload, `loadSettings()` (guarded by a
  type check / `Array.isArray`), and the type in `SavedState`
  (`src/services/storage/state.types.ts`). Migrate old shapes on read.

## Distribution

- **Non-sandboxed** (a terminal must spawn shells and read the user's filesystem,
  incl. `~/.claude`). Packaged with `electron-builder` (dmg + zip);
  `scripts/after-pack.js` applies post-pack steps. Bundled runtime assets (e.g.
  notification sounds) ship via `extraResources` and resolve from
  `process.resourcesPath` when packaged, or the repo's `resources/` dir in dev.

## Workflow Notes

- Enter a brief plan for non-trivial tasks (3+ steps). Use subagents for
  research/exploration to keep context clean.
- **No Assumptions:** when a path/name/flag/intent is ambiguous or there's more
  than one valid interpretation, ask (short multiple-choice) before proceeding.
- For a hard-to-reverse or outward-facing action (publishing, deleting,
  external calls), confirm first unless explicitly authorized.

## Plan Files

- All plan files live under `docs/plans/`. Create new plans there — do not put
  them anywhere else.
- Use the `<git-branch-name>-<plan-slug>.md` naming format. Ask the user for the
  branch name and the plan slug before writing the file; do not auto-generate
  either.
- **When running inside a Crafterm terminal**, the filename **must** include the
  pane suffix so the sidebar attributes the plan to the producing session:
  `<git-branch-name>-<plan-slug>--pane-${CRAFTERM_PANE_ID}.md`. The env var is
  injected by Crafterm at pty spawn (`echo $CRAFTERM_PANE_ID` to confirm). A
  plan written without this suffix is **ignored by the sidebar** — it will not
  appear under any pane.
