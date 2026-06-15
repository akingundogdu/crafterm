# Crafterm — Architecture & Component Refactor Plan

> **Status:** Plan only (no code changes yet). Awaiting review before implementation.
> **Branch:** `improve-crafterm` · **Date:** 2026-06-03
> **Target architecture:** Vanilla TS component system (no UI framework).
>
> **Scope decision (2026-06-03):** This refactor covers **code structure +
> CSS reorganization**: extracting components, the folder layout, the renderer
> service/data layer, the backend service split, **and** the CSS work (splitting
> `style.css`, per-component co-located CSS, design tokens) as the final phase
> (Phase 8). During Phases 1–7 CSS stays in the existing `style.css` (modules
> keep using current global classes); Phase 8 then carves it up and co-locates
> it. Adopting any **UI component library** (Franken UI / Shoelace / daisyUI) is
> **DEFERRED** (last phase) — revisited later, only if needed.

---

## Hard rules (non-negotiable)

These four constraints from the user govern **every** phase. Each is a gate, not a guideline.

**HR-1 — No behavior changes. Ever.** Only structural moves (extract, split, dedup,
relocate). The running logic and the **full featureset must stay behavior-identical**.
*Safety net:* before any refactoring, scan the whole codebase and bring
`docs/features.md` fully up to date — it is **stale** (missing Docker, Database,
dbPane, PR, Diff pane, Bookmarks, Daily plan, Accounts, Time, Explorer) — and turn
it into a **per-feature verification checklist**. After every phase, walk the
checklist feature-by-feature and confirm nothing regressed. A phase is not "done"
until its checklist passes. (See §3.10.)

**HR-2 — `crafterm-ui` first, then consume.** All UI is built from one reusable
component library shipped as a **separate package, `packages/crafterm-ui`**. Strict
workflow: (1) inventory every UI element in the app and **review the list together**;
(2) build the reusable component in `crafterm-ui` (usable app-wide); (3) only then
wire it into the specific screen. Even feature-specific UI: first promote it to a
`crafterm-ui` component, then use it. No screen builds bespoke UI that bypasses
`crafterm-ui`. (See §3.3.)

**HR-3 — Terminal is the brain; treat it as load-bearing.** Terminal management is the
core of the app — maximum caution. (1) Write `docs/terminal-architecture.md`, a
context doc derived from the featurelist, explaining exactly how the terminal logic
works end-to-end (pty spawn ↔ IPC ↔ xterm, lifecycle, input, activity detection, OSC
title, status bar). (2) Consolidate **all** terminal-based logic into a dedicated
module (main: terminal manager/service; renderer: terminal feature module). (3) Verify
every terminal change against that doc + the checklist with extra scrutiny. (See §3.8.)

**HR-4 — Scripts as templates, not embedded strings.** Stop generating shell commands
as inline strings in code. Externalize them as template files under
`resources/scripts/templates/` (matching the existing `resources/scripts/ios-worktree.sh`
+ `scriptsDir()` packaging pattern), using `{{placeholder}}` tokens for interpolation;
load + substitute at runtime. Targets: self-update steps (`index.ts:1370`),
`ensureClaudeShim`, the various `zsh -lic …` invocations, etc. (See §3.9.)

**HR-5 — Tests must NEVER touch the live `~/.crafterm/`.** Vitest unit/component runs
and Playwright E2E must use a throwaway, isolated state directory — never the real
`~/.crafterm/` (state.json, notebooks, todo-list.json) or `~/.crafterm-dev/`. Touching
them would corrupt the running app's data. *Mechanism:* make `stateDir()` honor an env
override (e.g. `CRAFTERM_STATE_DIR`); the default is unchanged (so HR-1 holds), and tests
point it at an OS temp dir (`os.tmpdir()`/`mktemp`). Playwright launches Electron with that
env set; component tests touch no filesystem at all. (See §3.11.)

---

## 0. Decisions locked in

| Decision | Choice | Rationale |
|---|---|---|
| UI foundation | **Vanilla TS + DOM component system** (no React/Vue/Lit) | Keeps existing rendering model (xterm, CodeMirror, treeview, node-pty/IPC) intact; zero rewrite risk; aligns with `CLAUDE.md`. |
| Reusable UI library | **`packages/crafterm-ui`** (separate package) | HR-2. All screens consume it; built component-first. |
| External UI library | **DEFERRED** (last phase) | shadcn/MUI need React → ruled out. Agnostic options (Franken UI / Shoelace / daisyUI) are a new dependency, postponed (see §6). |
| CSS reorganization | **In scope** (Phase 8, final phase) | Split `style.css`, co-locate per-component CSS, add design tokens — after the code structure lands (see §3.5, §5). |
| Behavior changes | **None** (HR-1) | Structural-only; verified against the `docs/features.md` checklist after each phase. |
| Domain model | **Table-oriented entities + repositories** (§3.12) | Model each entity (daily-task, worktree, …) as a DB-table-ready row now, behind repository interfaces, so the future JSON→SQLite migration (§10) is a backend swap, not a remodel. |
| Schema/validation | **Zod** (`z.infer` = single source of truth) | Per-entity Zod schema; TS type derived from it (kills live/`Saved*` duality); validates the JSON boundary on load. New dep (approved). |
| Feature spec | **Refresh `docs/features.md`** into a verification checklist | HR-1; it is stale and missing newer features. |
| Terminal | **Dedicated module + `docs/terminal-architecture.md`** | HR-3; core of the app, extra caution. |
| Shell scripts | **`resources/scripts/templates/` with `{{placeholder}}`** | HR-4; no more inline command strings. |
| Monorepo tooling | **pnpm workspaces + Turborepo** | Manage `packages/crafterm-ui` + the app; turbo runs build/test/typecheck pipelines (cached, parallel). Migrate npm → pnpm. |
| IPC bridge shape | **Namespaced** (`window.crafterm.git.*`) | Mirrors `services/ipc/` per-domain layout; discoverable. Change is contained to preload + service wrappers (post-Phase 2). |
| Test framework | **Vitest + happy-dom + Playwright E2E** | Unit (logic + main services), component (crafterm-ui DOM factories), and end-to-end (real Electron app). New dev deps. |
| Execution | **Incremental** (each phase compiles + passes tests) | Big-bang is too risky. |
| This turn | **Plan only** | Per user request. |

> **Component definition (this repo):** a *component* = a folder containing a
> factory function that returns (and owns) a DOM subtree + its own types. No
> JSX, no virtual DOM. Reactivity stays manual via the existing
> `hooks`/request-render pattern.
> **CSS timing:** during Phases 1–7 components do **not** carry a co-located
> `.css` — they reuse the existing classes in `style.css`. Co-locating each
> component's CSS happens in **Phase 8** (§3.5).

---

## 1. Current state — measured

### Scale
- **Renderer:** ~27,100 lines across 40 `.ts` + 6 `.css` files.
- **Main/preload:** ~3,500 lines.
- **`style.css`: 5,607 lines / 886 rule blocks** — one monolithic stylesheet for the whole app.
- **`main/index.ts`: 1,964 lines / 68 IPC handlers** — single god file.

### Largest files (refactor hot-spots)
| File | Lines | Problem |
|---|---|---|
| `style.css` | 5,607 | Monolith; every feature's CSS in one file. |
| `pickers.ts` | 2,685 | 10+ pickers + the only modal/search/list scaffolding, all in one file. |
| `main/index.ts` | 1,964 | pty/git/fs/claude/notebook/secrets/plans/menu all inline. |
| `settings.ts` | 1,935 | Multi-tab settings screen, no sub-component split. |
| `commands.ts` | 1,436 | High-level actions grab-bag. |
| `pane.ts` | 1,286 | Terminal lifecycle + activity detection + notifications. |
| `sidebar.ts` | 1,127 | Sidebar orchestration. |

### What is already good (keep + generalize)
- `treeview.ts` (+ `treeview.css`) — the **one real reusable component**; used by database/docker/notebook/sidebar. This is the model to replicate.
- `tree.ts` — pure data helpers (no DOM). Good separation; complements `treeview.ts`.
- `state.ts` `hooks` + `paneActions` indirection — breaks import cycles cleanly; this is our "manual reactivity" layer. Keep.
- `db.ts` / `docker.ts` / `pr.ts` — already extracted from main with a clean
  `registerXIpc()` pattern. This is the template for splitting `index.ts`.
- `dialog.ts` — 5 reusable modal prompts. Good seed for a primitive library.
- CSS already has section-comment boundaries per feature → splitting is mechanical, not guesswork.

---

## 2. Problems found (DRY / SOLID / structure)

### DRY violations
1. **Modal scaffolding duplicated ~8×.** `dialog.ts`, `pickers.ts` (`overlayModal`), `improve.ts`, `reminders.ts`, `dailyPlan.ts`, `docker.ts`, `pr.ts`, `bookmarks.ts` each build their own overlay → modal → actions → ESC/backdrop-close logic.
2. **Search/filter input reinvented** in `pickers.ts`, `improve.ts`, `notebook.ts`, `database.ts`, `docker.ts`.
3. **List + keyboard-nav (up/down/Enter)** reimplemented in `pickers.ts`, `improve.ts`, `docker.ts` (treeview only covers tree-shaped lists).
4. **Buttons / inputs / labels / form fields** assembled by hand with `createElement` + class strings everywhere (1,021 raw DOM-API call sites across the renderer).
5. **CSS:** repeated modal/list/button rules scattered through 5,607-line `style.css`.

### SOLID violations
- **SRP:** `main/index.ts` (window mgmt + pty + fs + git + claude + notebook + secrets + menu + notifications) and `pane.ts` (terminal + activity + notifications) and `settings.ts` (every settings tab) each do many jobs.
- **OCP:** adding a picker/modal means copy-pasting overlay+search+list boilerplate rather than extending a primitive.
- **DIP:** renderer feature modules talk to persistence and IPC directly (`window.crafterm.*` + inline `saveSoon()` calls scattered) instead of through a service abstraction.
- **ISP:** `preload/api.d.ts` is one 609-line flat surface — no domain grouping.

### Structural gaps
- No `components/` (reusable) vs `screens/` (feature) separation — all 40 files sit flat in `src/renderer/src/`.
- No data/service layer in the renderer — IPC calls, business logic, and DOM are interleaved in feature modules.
- No service layer in main — IPC handler callbacks contain the business logic inline.
- CSS not co-located with the code it styles (except the 5 feature `.css` files).

---

## 3. Target architecture

### 3.1 Renderer folder structure

> **Note:** the `.css` files shown below (and `tokens.css`) are filled in during
> **Phase 8**. In Phases 1–7 create only the `.ts` files; styles stay in the
> existing `style.css` until Phase 8 carves them into these co-located files.

```
packages/
  crafterm-ui/               # HR-2: reusable component library (separate package, see §3.3)
    package.json
    src/
      modal/        modal.ts        modal.css
      button/       button.ts       button.css
      input/        input.ts        input.css
      field/        field.ts        field.css
      list/         list.ts         list.css        # selectable + keyboard-nav list
      search-box/   search-box.ts   search-box.css
      overlay/      overlay.ts      overlay.css
      tabs/         tabs.ts         tabs.css
      treeview/     treeview.ts     treeview.css    # moved (already a primitive)
      context-menu/ context-menu.ts context-menu.css
      icons/        icons.ts                        # shared SVG string constants
      tokens.css                                    # design tokens (see §3.5)
      index.ts                                      # public barrel export

src/renderer/src/
  core/                      # infra: state, render orchestration, types, keybindings
    state.ts                 # singletons + hooks + paneActions (kept)
    types.ts
    keybindings.ts
    render.ts                # requestSidebar/requestStatuses/renderContent (moved out of state.ts)
  services/                  # NEW: renderer-side data/service layer (see §3.4)
    ipc/                     # typed thin wrappers over window.crafterm, grouped by domain
      terminal.service.ts    # pty:* wrappers (see §3.8)
      git.service.ts  fs.service.ts  claude.service.ts
      db.service.ts  pr.service.ts  docker.service.ts  notebook.service.ts
    storage/
      persistence.service.ts # serialize/load SavedState, saveSoon/persistNow (moved from state.ts)
      settings.service.ts
    domain/                  # business logic with no DOM (worktree rules, plan parsing, time calc)
  terminal/                  # HR-3: ALL renderer terminal logic consolidated here (see §3.8)
    terminal.ts              # xterm lifecycle (from pane.ts)
    activity-detection.ts    # activity + Claude awareness + notifications
    osc-title.ts             # OSC title following
    status-bar.ts            # per-pane status bar
  screens/                   # NEW: feature modules, each its own folder + child components
    improve-crafterm/
      improve-crafterm.ts  improve-crafterm.css
      components/            # feature-specific children (UI bits first promoted to crafterm-ui)
        feature-input.ts  todo-card.ts  progress-bar.ts   (+ each .css)
    settings/
      settings.ts  settings.css
      components/  general-tab.ts  projects-tab.ts  palette-tab.ts  tabs-tab.ts  appearance-tab.ts ...
    pickers/                 # split the 2,685-line pickers.ts into one folder per picker
      command-palette/ project-picker/ worktree-picker/ ssh-picker/ claude-picker/ ...
    pane/  content/  sidebar/  notifications/
    database/  docker/  pr/  diff-pane/  file-pane/  db-pane/  notebook/  reminders/
    bookmarks/  daily-plan/  explorer/  time/  accounts/
  app/
    main.ts                  # entry: wires DOM, keybindings, hooks/paneActions impls
    commands.ts              # high-level command dispatch (kept, possibly thinned)
  markdown.ts  themes.ts  palette-seed.ts  popout.ts  catalog.ts  tree.ts   # pure helpers stay

resources/scripts/           # HR-4: runtime shell scripts (shipped via extraResources)
  ios-worktree.sh            # existing
  templates/                 # NEW: externalized command templates with {{placeholder}} tokens
    self-update.sh.tmpl  claude-shim.zsh.tmpl  ...
```

> Naming follows the user's example: `screens/<feature>/<feature>.ts` +
> `screens/<feature>/components/<child>.ts`, each with a co-located `.css`
> (`.ts` instead of `.tsx` since there is no JSX). Reusable, app-wide UI lives in
> `packages/crafterm-ui`; `screens/<feature>/components/` holds only
> feature-specific children — and those still build *from* crafterm-ui primitives.

### 3.2 Component convention (the contract every component follows)

```ts
// packages/crafterm-ui/src/modal/modal.ts
// CSS timing: no `import './modal.css'` until Phase 8 — reuse existing `.modal*` classes from style.css.

export interface ModalOptions { title?: string; className?: string; onClose?: () => void }
export interface ModalHandle { el: HTMLElement; body: HTMLElement; close: () => void; setBusy(b: boolean): void }

export function createModal(opts: ModalOptions = {}): ModalHandle { /* builds overlay+modal, returns handle */ }
```

Rules:
- A component is a **factory** `createX(opts) => Handle`. It owns its DOM and cleanup.
- Returns a **handle** (element + imperative methods), never relies on global lookups.
- Styling: reuse existing `style.css` classes during Phases 1–7; co-located `import './x.css'` is added in Phase 8 (§3.5).
- No business logic, no `window.crafterm`, no `state` imports inside `crafterm-ui`. Pure, app-agnostic UI.
- Feature-specific child components live under `screens/<feature>/components/`, *may* import services/state, but **build their visuals from crafterm-ui primitives** (HR-2).

### 3.3 `crafterm-ui` — reusable component package (HR-2)

**Setup:** convert the repo to a **pnpm workspace** (`pnpm-workspace.yaml` → `packages: ["packages/*", "."]`)
managed by **Turborepo** (`turbo.json` pipelines: `build`, `test`, `typecheck`, `lint`).
Add `packages/crafterm-ui` with its own `package.json` + `tsconfig`, referenced from the
renderer as `@crafterm/ui` (workspace protocol). electron-vite/Vite resolves workspace packages
out of the box; the package emits no separate build (source-imported in dev, bundled in prod).
Migrate the root `npm` scripts to pnpm; CLAUDE.md's `npm run …` commands become `pnpm …`.

**Mandatory workflow (HR-2) for every UI element:**
1. **Inventory** — produce a complete list of every UI element/pattern in the app today
   (Phase 0 deliverable) and **review it together** before building.
2. **Build in `crafterm-ui`** — implement the reusable component (app-agnostic, no state/IPC).
3. **Consume** — only then wire it into the screen. Never build bespoke UI in a screen that
   bypasses `crafterm-ui`. Need something new for one screen? Promote it to `crafterm-ui` first.

**Primitives to build (DRY collapse targets):**

| Primitive | Replaces duplication in | Source seed |
|---|---|---|
| `overlay` + `modal` | dialog, pickers, improve, reminders, dailyPlan, docker, pr, bookmarks | `dialog.ts` + `pickers.overlayModal` |
| `button` | every `createElement('button')` + `.primary` class | — |
| `input` / `field` | every form input + `.field`/`label` pattern | `dialog.ts` fields |
| `search-box` | pickers, improve, notebook, database, docker | `pickers.makeSearchInput` |
| `list` (selectable + keyboard nav) | pickers, improve, docker | `pickers` list code |
| `tabs` | settings sub-tabs, right panel tabs | `settings.buildSubTabs` |
| `treeview` | already shared — just relocate | `treeview.ts` |
| `context-menu` | already exists — relocate | `contextmenu.ts` |
| `icons` | inline SVG constants scattered across modules | gather `FOLDER_SVG` etc. |

`dialog.ts` (`promptText/promptConfirm/promptSelect/promptForm`) gets **rebuilt on top of** `modal`+`field`+`button` so there is one modal implementation underneath.

### 3.4 Renderer data / service layer (separation of concerns)

Today feature modules call `window.crafterm.*` directly and sprinkle `saveSoon()`. Introduce three layers:

1. **`services/ipc/*.service.ts`** — one typed module per IPC domain; the *only* place that touches `window.crafterm`. Feature code imports `gitService.listBranches(cwd)` instead of `window.crafterm.gitBranches(cwd)`. Makes the renderer testable and the IPC surface discoverable.
2. **`services/storage/*`** — owns `SavedState` serialization, `saveSoon`/`persistNow`, settings load/migrate. Moved out of `state.ts` (which keeps only singletons + hooks). Features call `persistence.save()` not raw timers.
3. **`services/domain/*`** — pure business logic with no DOM and no IPC transport concerns (e.g. plan-filename parsing already in `main/planFilename.ts`; worktree path rules; time aggregation; token-usage math currently inline in main). **Includes `domain/model/*` (table-oriented entities + schemas) and `storage/repositories/*` (the JSON→SQLite swap seam) — see §3.12.**

### 3.5 CSS strategy (Phase 8 — final phase, in scope)

> Done after the code structure lands. During Phases 1–7 `style.css` is left
> untouched and modules keep using its global classes; Phase 8 then executes the
> split below.

- **`crafterm-ui/src/tokens.css`** — promote the existing CSS custom properties (`--accent`, `--text-dim`, etc.) into one tokens file = the single source of design truth (color, spacing, radius, font). This is what guarantees UI consistency across reusable components.
- **Co-locate**: each component/screen owns its `.css`, imported from its `.ts`. Vite's bundler already supports `import './x.css'`.
- **Split `style.css`** (5,607 lines) along its existing section comments into the matching component/screen `.css` files. Mechanical, low-risk, done last so it doesn't churn while modules move.
- One small `global.css` remains for resets, scrollbars, and `<html>`/`<body>` base.
- **Naming convention (component-name-based):** every CSS class/variable is prefixed with its component's **full name**, followed by the styled aspect. E.g. a `button` component → `button-background-color`; a `right-section-tab-page-container` component → `right-section-tab-page-container-background-color`. This makes each rule self-documenting and traceable to exactly one component (and prevents cross-component collisions).

### 3.6 Main (backend) service layer

Apply the proven `registerXIpc()` pattern (from db/docker/pr) to the whole of `index.ts`:

```
src/main/
  index.ts                 # ONLY: app lifecycle, window/pop-out creation, menu, wiring registerXIpc()
  ipc/                     # thin handler registration per domain
    terminal.ipc.ts  git.ipc.ts  fs.ipc.ts  claude.ipc.ts  notebook.ipc.ts
    secrets.ipc.ts  plans.ipc.ts  store.ipc.ts  app-update.ipc.ts  sound.ipc.ts
  services/                # business logic (no ipcMain) — testable in isolation
    terminal.manager.ts    # HR-3: the Map<id,IPty>, owners, popouts, spawn/kill/resize
    claude.usage.ts        # the ~100-line JSONL token aggregation (currently inline)
    git.service.ts  fs.service.ts  notebook.service.ts  plans.watcher.ts  secrets.service.ts
    scripts.ts             # HR-4: loadScript(name, vars) — read template + {{token}} substitution
  windows/                 # BrowserWindow + pop-out creation, sendToRenderer/sendToOwner
  db.ts  docker.ts  pr.ts  planFilename.ts   # already clean — fold into ipc/+services/ naming
```

Target: `index.ts` drops from ~1,964 lines to a few hundred (lifecycle + wiring only).

### 3.7 Preload organization

Split `preload/api.d.ts` (609 lines, flat) and `preload/index.ts` into domain-grouped namespaces mirroring `services/ipc/` so the three-layer edit (handler ↔ preload ↔ type) stays aligned per domain. **Decided:** `window.crafterm` becomes **namespaced** — `window.crafterm.git.*`, `crafterm.pty.*`, `crafterm.db.*`, etc. Done in Phase 4 alongside the preload split; the change is contained because, after Phase 2, only `services/ipc/*.service.ts` wrappers touch the bridge.

### 3.8 Terminal core module (HR-3)

Terminal is the app's brain — handle it as the most load-bearing, highest-caution area.

**Context doc first:** write `docs/terminal-architecture.md` from the featurelist (features.md §3.2, §4) — the full end-to-end story: `pty.spawn` in main ↔ IPC (`pty:*`) ↔ xterm in renderer; pane lifecycle; input handling; activity detection + Claude awareness; OSC title following; per-pane status bar; pop-out hand-off; the `CRAFTERM_PANE_ID` env injection. Every terminal change is verified against this doc + the feature checklist.

**Consolidate, don't rewrite:**
- **Main:** `main/services/terminal.manager.ts` — the `Map<id, IPty>`, `owners`, `popouts` state and `spawn/write/resize/kill` (lifted verbatim from `index.ts:45–174`); `main/ipc/terminal.ipc.ts` registers the `pty:*` handlers thinly.
- **Renderer:** `src/renderer/src/terminal/` — split `pane.ts` (1,286 lines) into `terminal.ts` (xterm lifecycle), `activity-detection.ts`, `osc-title.ts`, `status-bar.ts`. Pure moves; behavior identical.
- **No logic edits** to PTY data flow, byte piping, resize, or activity heuristics — relocation only.

### 3.9 Script templates (HR-4)

Replace inline shell-command strings with template files under `resources/scripts/templates/`.

- **Loader:** a tiny `loadScript(name, vars)` helper (main) reads the template from `scriptsDir()` and replaces `{{token}}` occurrences — one place, readable, packaged via `extraResources` like `ios-worktree.sh`.
- **Format:** templates are plain `.sh`/`.zsh` text with `{{placeholder}}` tokens (e.g. `git -C {{cwd}} pull`).
- **Migration targets (inventory in Phase 0):** self-update `steps` (`index.ts:1370`), `ensureClaudeShim` shim body (`index.ts:256`), `zsh -lic` one-liners (`index.ts:1034`, `:1435`), and any other in-code command assembly. SQL/state file writers that are data (not commands) stay as-is.
- **HR-1 guard:** the generated command string must be byte-identical to today's after substitution — diff before/after.

### 3.10 Feature inventory & verification (HR-1)

The single safety net against behavior regressions.

- **Refresh `docs/features.md`:** scan the whole codebase; add every feature missing since it went stale (Docker, Database, dbPane, PR, Diff pane, Bookmarks, Daily plan, Accounts, Time, Explorer, treeview, project nodes, and any others), with current `file:line` refs.
- **Add a verification checklist:** each feature gets concrete "how to confirm it still works" steps (action → expected result) and a checkbox.
- **Cadence:** run the relevant checklist slice after each phase; run the full checklist before declaring the refactor done. A phase that can't pass its slice is reverted/fixed before moving on.
- This doc is produced and reviewed in **Phase 0**, before any code moves.

### 3.11 Testing strategy (Vitest + happy-dom + Playwright)

Three tiers, orchestrated by Turborepo (`turbo run test`), each runnable in isolation:

| Tier | Tool | Scope | Notes |
|---|---|---|---|
| **Unit** | Vitest (node env) | `services/domain/*`, `core/tree`, `markdown`, `planFilename`, main services (`terminal.manager`, `scripts.ts`, `git.service`) | Mock `node-pty`/`child_process`/`fs`; fast, the bulk. |
| **Component** | Vitest + **happy-dom** | every `crafterm-ui` factory (`modal`, `button`, `list`, `tabs`, `treeview`…) | Render the factory, assert DOM + simulate click/keyboard. **No filesystem.** |
| **E2E** | **Playwright** (`_electron`) | real Electron app: terminal spawn, pane split, sidebar, pickers | Launches the packaged/unpacked app. |

**HR-5 isolation (mandatory):**
- `stateDir()` gains an env override `CRAFTERM_STATE_DIR`; default behavior unchanged.
- Every test/E2E run sets `CRAFTERM_STATE_DIR` to a fresh `os.tmpdir()` dir, created in setup and removed in teardown. **Never** the real `~/.crafterm/` or `~/.crafterm-dev/`.
- Playwright `_electron.launch({ env: { ...process.env, CRAFTERM_STATE_DIR: tmp } })`.
- A guard assertion in the shared test setup fails loudly if `CRAFTERM_STATE_DIR` is unset or points inside `$HOME/.crafterm*`.
- Component/unit tests touch no FS; any that must, go through the temp dir only.

**Co-location:** `*.test.ts` next to the unit under test; Playwright specs under `e2e/`. Coverage is additive — tests are written for code as it moves into the new structure, not retrofitted all at once.

### 3.12 Domain model & repositories (DB-migration-ready) — HIGH PRIORITY

The model is modeled **now** as if each entity were already a database table, so the later JSON → SQLite migration (§10) is a backend swap, not a remodel. Today's state is one `SavedState` blob (arrays + two recursive trees) with parallel live/`Saved*` types and a hand-written serializer. We replace that with an explicit, table-oriented domain model + a repository seam.

**Structure — one module per entity:**
```
src/renderer/src/services/domain/model/
  daily-task.ts      worktree.ts        reminder.ts       bookmark.ts
  account.ts         time-entry.ts      notification.ts   meeting-note.ts
  project.ts  application.ts  project-command.ts  feature.ts
  palette-command.ts ssh-connection.ts  db-connection.ts  db-group.ts
  action-menu-item.ts  settings.ts
  sidebar-node.ts    layout-node.ts     pane.ts
```
Each module exports: a **Zod schema** as the source of truth, the **entity type** derived from it (`type DailyTask = z.infer<typeof dailyTaskSchema>` — single, unified, kills the live vs `Saved*` duality), a **default factory**, and (de)serialize helpers. No behavior/methods on entities — plain rows. (Zod also pairs with `drizzle-zod` if the §10 SQLite step uses Drizzle.)

**Table-readiness rules (apply to every entity):**
1. **Stable string `id`** on every row (most already have one; add where missing).
2. **Reference by id (FK-style), not nested embedding**, for anything that would become its own table. e.g. `Project` → `applications`, `project_commands`, `features` become separate entities with `projectId`, not nested arrays. `DailyPlanData` → `daily_tasks` (+ `daily_tags`) with `taskId`/`tagId`.
3. **Flat scalar/enum fields**; timestamps as epoch numbers (already the `Date.now()` pattern). Enums stay string-literal unions.
4. **Recursive trees** (split `LayoutNode`, `SidebarNode`) modeled as **node rows** — `{ id, parentId, position, type, ...payload }` — so they migrate to a `nodes`/`layout_nodes` table. (Document/JSON-column is the fallback if a tree proves too costly to normalize; decide per tree.)
5. **No drift:** one type per entity; the serializer is generated from the schema, not hand-maintained in two places.

**Repository seam (`services/storage/repositories/`):** one repository per entity/aggregate exposing CRUD-ish methods — `getAll()`, `get(id)`, `upsert(row)`, `remove(id)`, `query(filter)`. Phase-2 implementation is **JSON-backed** (reads the loaded state, writes through `persistence.service`). The future SQLite backend (§10) implements the **same repository interfaces** — entities and all callers stay unchanged. This is the single swap point for the DB migration.

> **Why now:** doing the table-oriented modeling + repositories during this refactor (not after) means the JSON→SQLite step is "implement the repo interfaces against SQLite + one data migration," with no churn to features. Aligns with §10.

---

## 4. Mapping: current file → target location

| Current | Target |
|---|---|
| `state.ts` | split → `core/state.ts` (singletons+hooks) + `services/storage/persistence.service.ts` + `core/render.ts` |
| `types.ts` | `core/types.ts` (+ per-domain type files as they grow) |
| `main.ts` | `app/main.ts` |
| `commands.ts` | `app/commands.ts` (thinned; pure logic → `services/domain/`) |
| `dialog.ts` | rebuilt on `crafterm-ui` `modal`+`field`+`button` |
| `pickers.ts` (2,685) | `screens/pickers/<one folder per picker>` + uses `crafterm-ui` `{modal,search-box,list}` |
| `settings.ts` (1,935) | `screens/settings/` + one child component per tab (children built from crafterm-ui) |
| `improve.ts` | `screens/improve-crafterm/` + `components/{feature-input,todo-card,progress-bar}` |
| `pane.ts` (1,286) | **`src/renderer/src/terminal/`** (HR-3): `terminal.ts` + `activity-detection.ts` + `osc-title.ts` + `status-bar.ts` |
| `sidebar.ts` | `screens/sidebar/` + child components |
| `treeview.ts/.css`, `contextmenu.ts` | `packages/crafterm-ui/src/treeview/`, `…/context-menu/` |
| `tree.ts`, `catalog.ts`, `markdown.ts`, `themes.ts`, `palette-seed.ts`, `popout.ts` | stay as pure helpers (relocate under `core/` or keep flat) |
| `database.ts/.css`, `docker.ts`, `pr.ts`, `dbPane.ts/.css`, `diffPane.ts`, `filePane.ts`, `dbResultGrid.ts`, `sqlEditor.ts`, `notebook.ts/.css`, `reminders.ts`, `bookmarks.ts`, `dailyPlan.ts`, `explorer.ts`, `time.ts`, `accounts.ts`, `notifications.ts`, `content.ts` | `screens/<feature>/` each, with child components + co-located CSS |
| `main/index.ts` (1,964) | `main/index.ts` (lifecycle only) + `main/ipc/*` + `main/services/*` (incl. `terminal.manager.ts`, `scripts.ts`) + `main/windows/*` |
| inline shell-command strings (`index.ts:256/1034/1370/1435`, …) | **`resources/scripts/templates/*.tmpl`** with `{{placeholder}}` (HR-4) |
| `preload/*` | domain-grouped namespaces |
| `style.css` (5,607) | split into co-located component/screen `.css` + `crafterm-ui/src/tokens.css` + `global.css` |
| `docs/features.md` (stale) | refreshed full feature inventory + verification checklist (HR-1) |
| — (new) | `docs/terminal-architecture.md` terminal context doc (HR-3) |

---

## 5. Phased migration (each phase ends compiling + running)

> **Per-phase detail files** (this file is the index; each phase has its own execution doc):
> - [Phase 0 — Baseline docs, tooling & scaffolding](./improve-crafterm-phase-0-baseline-tooling-e1034e15-5a56-429d-8828-5992b69040e4.md)
> - [Phase 1 — crafterm-ui reusable components](./improve-crafterm-phase-1-crafterm-ui-e1034e15-5a56-429d-8828-5992b69040e4.md)
> - [Phase 2 — Renderer service/data layer](./improve-crafterm-phase-2-renderer-services-e1034e15-5a56-429d-8828-5992b69040e4.md)
> - [Phase 3 — Script template externalization](./improve-crafterm-phase-3-script-templates-e1034e15-5a56-429d-8828-5992b69040e4.md)
> - [Phase 4 — Backend service split + terminal manager](./improve-crafterm-phase-4-backend-split-e1034e15-5a56-429d-8828-5992b69040e4.md)
> - [Phase 5 — Terminal renderer consolidation](./improve-crafterm-phase-5-terminal-consolidation-e1034e15-5a56-429d-8828-5992b69040e4.md)
> - [Phase 6 — Feature → screen migration](./improve-crafterm-phase-6-screen-migration-e1034e15-5a56-429d-8828-5992b69040e4.md)
> - [Phase 7 — Dedup sweep](./improve-crafterm-phase-7-dedup-sweep-e1034e15-5a56-429d-8828-5992b69040e4.md)
> - [Phase 8 — CSS reorganization](./improve-crafterm-phase-8-css-reorg-e1034e15-5a56-429d-8828-5992b69040e4.md)
> - [Phase 9 — External UI library adoption (deferred)](./improve-crafterm-phase-9-ui-library-e1034e15-5a56-429d-8828-5992b69040e4.md)

> **Verification per phase (HR-1):** (1) `turbo run typecheck` (tsc on both configs);
> (2) `turbo run build`; (3) `turbo run test` (unit + component + relevant E2E, all with
> `CRAFTERM_STATE_DIR` → temp, HR-5); (4) `pnpm dev` + walk the relevant slice of the
> `docs/features.md` checklist feature-by-feature. No phase is "done" until its checklist
> slice and tests pass. Each phase is one small, feature-scoped PR.

**Phase 0 — Baseline docs, tooling & scaffolding** (no behavior change)
- **HR-1:** scan the whole codebase and refresh `docs/features.md` into a complete per-feature **verification checklist** (add Docker/DB/PR/Diff/Bookmarks/Daily-plan/Accounts/Time/Explorer, etc.).
- **HR-3:** write `docs/terminal-architecture.md` (terminal end-to-end context doc).
- **HR-2:** produce the **UI component inventory** list → **review together** before building.
- **Tooling:** migrate npm → **pnpm workspace + Turborepo** (`pnpm-workspace.yaml`, `turbo.json`); scaffold empty `packages/crafterm-ui`, the `core/`/`services/`/`screens/`/`terminal/` dirs, and `resources/scripts/templates/`.
- **Test harness (HR-5):** add Vitest (node + happy-dom projects) + Playwright `_electron`; add the `CRAFTERM_STATE_DIR` override to `stateDir()` (default unchanged) and the shared setup guard that refuses to run against `~/.crafterm*`. Add a tiny E2E smoke (app launches, spawns a terminal in the temp dir) as the first regression net.
- Document the component contract (§3.2).

**Phase 1 — `crafterm-ui` reusable components** (HR-2 foundation)
- Build `overlay`, `modal`, `button`, `input`, `field`, `search-box`, `list`, `tabs` in `packages/crafterm-ui` as `.ts` factories reusing existing `style.css` classes (CSS co-location waits for Phase 8).
- Relocate `treeview` + `context-menu` into `crafterm-ui` (keep their `.css` in place for now).
- Rebuild `dialog.ts` on top of crafterm-ui (proves the library; callers keep working).

**Phase 2 — Renderer service/data layer**
- Create `services/ipc/*.service.ts` wrappers; migrate features off direct `window.crafterm.*` incrementally.
- Move persistence out of `state.ts` → `services/storage/persistence.service.ts`; pure logic → `services/domain/`.

**Phase 3 — Script template externalization** (HR-4, isolated/low-risk)
- Add `main/services/scripts.ts` (`loadScript` + `{{token}}` substitution).
- Move inline command strings to `resources/scripts/templates/*.tmpl`. **Diff generated output byte-for-byte** against today's.

**Phase 4 — Backend service split + terminal manager (main)** (HR-3)
- Extract `index.ts` via `registerXIpc()`: terminal(pty), git, fs, claude, notebook, secrets, plans, store, app-update, sound → `main/ipc/*` + `main/services/*` (incl. `terminal.manager.ts`) + `main/windows/*`.
- Regroup `preload` per domain in lockstep and switch the bridge to the **namespaced** shape (`window.crafterm.git.*`, `crafterm.pty.*`, …); update the `services/ipc/*` wrappers (the only callers post-Phase 2). `index.ts` becomes wiring-only. **PTY data flow lifted verbatim.**

**Phase 5 — Terminal renderer consolidation** (HR-3, highest caution)
- Split `pane.ts` into `src/renderer/src/terminal/{terminal,activity-detection,osc-title,status-bar}.ts` — **pure relocation, no logic edits.**
- Verify against `docs/terminal-architecture.md` + full terminal checklist slice with extra scrutiny.

**Phase 6 — Feature → screen migration** (one feature per PR, easiest-first)
- Suggested order (small/standalone → large/central): `bookmarks` → `explorer` → `time` → `reminders` → `daily-plan` → `accounts` → `pr`/`diff-pane`/`file-pane` → `docker` → `database`/`db-pane` → `improve-crafterm` → `notifications` → `pickers` (split per picker) → `settings` (split per tab) → `sidebar` → `content`.
- Each feature: move to `screens/<feature>/`, extract child components (built from crafterm-ui — HR-2), route through services. CSS stays in `style.css` until Phase 8.

**Phase 7 — Dedup sweep**
- Delete now-dead ad-hoc modal/search/list code. Confirm every modal uses crafterm-ui `modal`, every list uses crafterm-ui `list`.

**Phase 8 — CSS reorganization** (in scope; was the earlier "Phase 6")
- Extract design tokens into `crafterm-ui/src/tokens.css`; import once globally.
- Co-locate each component/screen's CSS (`import './x.css'`), carving sections out of `style.css` along its existing section-comment boundaries.
- Leave only a small `global.css`. Verify visual parity section-by-section.

---

**Phase 9 — External UI library adoption — DEFERRED (out of scope for now; was "Phase 7")**
- Later, if needed: pick one library from §6 and back chosen crafterm-ui primitives with it behind the unchanged `createX()` API. Requires dependency approval.

---

## 6. Framework-agnostic UI library — evaluation (DEFERRED)

> **Deferred (2026-06-03):** we are skipping any UI library for this refactor and
> will revisit only if needed after the structural work lands. The evaluation
> below is kept for that later decision.

You asked to consider an agnostic library instead of going React. Options that work in vanilla TS:

| Option | What it is | Fit | Cost |
|---|---|---|---|
| **Franken UI** | shadcn/ui look, HTML-first; UIkit 3 JS + LitElement web components (JS behavior built in, modular/optional) | Vanilla-friendly; shadcn aesthetic; shrinks generic chrome CSS but not terminal-specific CSS | Tailwind-based styling (standalone prebuilt CSS or full Tailwind build); reconcile with existing tokens |
| **Microsoft Fluent UI Web Components (FAST)** | Web Components, dev-tool/VS Code aesthetic, design-token driven | Strong fit for a dev tool; isolated | New dependency |
| **Shoelace / Web Awesome** | Web Components, framework-agnostic, themable via CSS vars | Works in vanilla; good form controls + built-in behavior | New dependency; shadow-DOM theming reconciliation; bundle size |
| **daisyUI** | CSS classes on top of **Tailwind** (CSS-only, you wire behavior) | Excellent themes; but a parallel styling system next to existing `style.css` | Requires adding Tailwind (build change); risks two competing style systems |
| **Pico CSS / Open Props** | Classless CSS / design-token set | Minimal, no build change, plays well with existing CSS | Smallest footprint; fewer ready components |
| **Homegrown primitives** (§3.3) | Our own factories | Perfect fit with existing `style.css`/widgets | Engineering time only; zero new deps |

**Recommendation (for the later decision):** the architecture (§3.2–3.3) is identical whether a primitive is hand-written or wraps a library — the factory/handle contract is the seam. So we build **homegrown primitives** now, and *if* we later want richer controls we can back specific primitives (e.g. `input`, `tabs`) with Franken UI / Shoelace behind the same `createX()` API without touching feature code.

> **Approval gate:** Adding any UI library (Franken/Shoelace/daisyUI/Tailwind) is
> a new dependency. Per `CLAUDE.md` I will **not** add it without your explicit
> go-ahead. Decision deferred to a later round.

---

## 7. Risks & mitigations
- **Behavior regressions (HR-1)** → primary risk. Mitigated by the refreshed `docs/features.md` checklist walked after every phase; structural-only moves; small feature-scoped PRs.
- **Terminal breakage (HR-3)** → terminal logic moved **verbatim**, no edits to PTY/IPC/activity heuristics; verified against `docs/terminal-architecture.md` with extra scrutiny; terminal in its own phases (4–5).
- **Script externalization (HR-4)** → generated command must be byte-identical post-substitution; diff before/after.
- **`crafterm-ui` workspace setup (HR-2)** → small risk in Vite/electron-vite resolution + packaging; validate in Phase 0/1 before mass adoption.
- **npm → pnpm + turbo migration** → lockfile change, CI scripts, and especially `electron-rebuild` of the native `node-pty` module under pnpm's symlinked store (`node-linker=hoisted` may be needed). Validate `pnpm rebuild`/`pnpm dist:dir` early in Phase 0.
- **Test isolation (HR-5)** → a test that forgets `CRAFTERM_STATE_DIR` could clobber live data; mitigated by the shared-setup guard that hard-fails on `~/.crafterm*` and by per-run temp dirs.
- **E2E flakiness** → Playwright `_electron` + terminal timing; keep E2E focused on high-value flows, generous waits, isolated state.
- **Native widgets** (xterm, CodeMirror, node-pty) → untouched; stay imperative. Main reason to avoid React.
- **Import cycles** → preserved via existing `hooks`/`paneActions` indirection; services import down, never up into screens.
- **CSS regressions during split** → do CSS split last (Phase 8), section-by-section, with visual diffing.
- **Plan-file sidebar attribution** → keep the `--pane-${CRAFTERM_PANE_ID}` suffix for future plan files.

## 8. Resolved decisions
1. **IPC bridge shape** → **namespaced** (`window.crafterm.git.*`). (§3.7, Phase 4)
2. **Test framework** → **Vitest + happy-dom + Playwright E2E**, in scope. (§3.11)
3. **Monorepo tooling** → **pnpm workspaces + Turborepo**. (§3.3, Phase 0)
4. **Test isolation** → tests/E2E use `CRAFTERM_STATE_DIR` temp dir, never `~/.crafterm*`. (HR-5, §3.11)
5. **Domain model** → table-oriented entities + repositories, modeled now for the future SQLite swap. (§3.12, §10)
6. **Schema/validation** → **Zod** (`z.infer` single source of truth). (§3.12, Phase 2)
7. **External UI library** → deferred (Phase 9). (§6)

*No open questions remain — ready to implement on approval.*

## 9. Out of scope (this round)
- **External UI component library** — Franken UI / Shoelace / Fluent / daisyUI etc. (deferred, §6 / Phase 9).
- Functional/behavioral changes to features — **forbidden by HR-1** (structure-only refactor).
- Backlog items in `~/.crafterm/todo-list.json` (tracked separately).
- Packaging/distribution changes (beyond shipping the new `resources/scripts/templates/`).
- **Storage backend change (JSON → SQLite)** — see §10; a separate future project, not this refactor.

## 10. Future considerations (NOT in this refactor)

### Persistence backend: JSON → local SQLite
Today state is one JSON blob at `~/.crafterm/crafterm-state.json`, rewritten wholesale on each debounced save. `better-sqlite3` is already a dependency (DB tool). Moving the app's own data to a local SQLite DB is **out of scope** (it's a behavior/architecture change → violates HR-1), but worth evaluating later.

- **Pros:** incremental row writes (no full-file rewrite); crash-safe transactions/WAL (a half-write can't corrupt everything); queryable append-heavy data (notifications log, time tracking, command history, saved queries) without loading all into memory; better scaling + structured migrations.
- **Cons:** more complexity (schema/queries/migrations); the core **split/sidebar trees** don't map to relational tables (you'd store them as JSON columns anyway → little gain there); `better-sqlite3` runs in **main**, but the renderer currently owns state → adds IPC round-trips or shifts state ownership; binary file is harder to inspect/hand-edit than JSON; one-time user-data migration carries risk to live `~/.crafterm`.
- **Recommended shape (if pursued):** **hybrid** — keep JSON for small tree-shaped config/state (layout, settings, sidebar); move append-heavy/queryable data to SQLite. The table-oriented model (§3.12) already maps each entity 1:1 to a future table.
- **Enabler:** the Phase 2 **repositories** (§3.12) are the single swap seam — the SQLite backend just implements the same repository interfaces + one data migration; entities and all callers stay unchanged. The refactor *enables* this without committing to it.
- **Plan of record:** the user intends to do the SQLite migration **after** the main refactor lands. The table-ready modeling in §3.12 is done now precisely so that step is friction-free.
