# Crafterm — Architecture & Component Refactor Plan

> **Status:** Plan only (no code changes yet). Awaiting review before implementation.
> **Branch:** `improve-crafterm` · **Date:** 2026-06-03
> **Target architecture:** Vanilla TS component system (no UI framework).
>
> **Scope decision (2026-06-03):** This refactor covers **code structure +
> CSS reorganization**: extracting components, the folder layout, the renderer
> service/data layer, the backend service split, **and** the CSS work (splitting
> `style.css`, per-component co-located CSS, design tokens) as the final phase
> (Phase 6). During Phases 1–5 CSS stays in the existing `style.css` (modules
> keep using current global classes); Phase 6 then carves it up and co-locates
> it. Adopting any **UI component library** (Franken UI / Shoelace / daisyUI) is
> **DEFERRED** (Phase 7) — revisited later, only if needed.

---

## 0. Decisions locked in

| Decision | Choice | Rationale |
|---|---|---|
| UI foundation | **Vanilla TS + DOM component system** (no React/Vue/Lit) | Keeps existing rendering model (xterm, CodeMirror, treeview, node-pty/IPC) intact; zero rewrite risk; aligns with `CLAUDE.md`. |
| Component library | **DEFERRED** (Phase 7) | shadcn/MUI need React → ruled out. Agnostic options (Franken UI / Shoelace / daisyUI) are a new dependency and are postponed to a later round (see §6). |
| CSS reorganization | **In scope** (Phase 6, final phase) | Split `style.css`, co-locate per-component CSS, add design tokens — done after the code structure lands (see §3.5, §5). |
| Execution | **Incremental** (each phase compiles + runs) | No test framework exists; big-bang is too risky. |
| This turn | **Plan only** | Per user request. |

> **Component definition (this repo):** a *component* = a folder containing a
> factory function that returns (and owns) a DOM subtree + its own types. No
> JSX, no virtual DOM. Reactivity stays manual via the existing
> `hooks`/request-render pattern.
> **CSS timing:** during Phases 1–5 components do **not** carry a co-located
> `.css` — they reuse the existing classes in `style.css`. Co-locating each
> component's CSS happens in **Phase 6** (§3.5).

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
> **Phase 6**. In Phases 1–5 create only the `.ts` files; styles stay in the
> existing `style.css` until Phase 6 carves them into these co-located files.

```
src/renderer/src/
  core/                      # infra: state, render orchestration, types, keybindings
    state.ts                 # singletons + hooks + paneActions (kept)
    types.ts
    keybindings.ts
    render.ts                # requestSidebar/requestStatuses/renderContent (moved out of state.ts)
  services/                  # NEW: renderer-side data/service layer (see §3.4)
    ipc/                     # typed thin wrappers over window.crafterm, grouped by domain
      pty.service.ts
      git.service.ts
      fs.service.ts
      claude.service.ts
      db.service.ts
      pr.service.ts
      docker.service.ts
      notebook.service.ts
    storage/
      persistence.service.ts # serialize/load SavedState, saveSoon/persistNow (moved from state.ts)
      settings.service.ts
    domain/                  # business logic with no DOM (worktree rules, plan parsing, time calc)
  components/                # NEW: reusable, app-agnostic UI primitives (see §3.3)
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
  screens/                   # NEW: feature modules, each its own folder + child components
    improve-crafterm/
      improve-crafterm.ts
      improve-crafterm.css
      components/
        feature-input.ts  feature-input.css
        todo-card.ts      todo-card.css
        progress-bar.ts   progress-bar.css
    settings/
      settings.ts  settings.css
      components/
        general-tab.ts  projects-tab.ts  palette-tab.ts  tabs-tab.ts  appearance-tab.ts  ... (+ each .css)
    sidebar/
    pickers/                 # split the 2,685-line pickers.ts into one file per picker
      command-palette/ project-picker/ worktree-picker/ ssh-picker/ claude-picker/ ...
    database/  docker/  pr/  diff-pane/  file-pane/  db-pane/  notebook/  reminders/
    bookmarks/  daily-plan/  explorer/  time/  accounts/  notifications/  pane/  content/
  app/
    main.ts                  # entry: wires DOM, keybindings, hooks/paneActions impls
    commands.ts              # high-level command dispatch (kept, possibly thinned)
  markdown.ts  themes.ts  palette-seed.ts  popout.ts  catalog.ts  tree.ts   # pure helpers stay
```

> Naming follows the user's example: `screens/<feature>/<feature>.ts` +
> `screens/<feature>/components/<child>.ts`, each with a co-located `.css`.
> (`.ts` instead of `.tsx` since there is no JSX.)

### 3.2 Component convention (the contract every component follows)

```ts
// components/modal/modal.ts
// CSS deferred: no `import './modal.css'` yet — reuse existing `.modal*` classes from style.css.

export interface ModalOptions { title?: string; className?: string; onClose?: () => void }
export interface ModalHandle { el: HTMLElement; body: HTMLElement; close: () => void; setBusy(b: boolean): void }

export function createModal(opts: ModalOptions = {}): ModalHandle { /* builds overlay+modal, returns handle */ }
```

Rules:
- A component is a **factory** `createX(opts) => Handle`. It owns its DOM and cleanup.
- Returns a **handle** (element + imperative methods), never relies on global lookups.
- Styling: reuse existing `style.css` classes during Phases 1–5; co-located `import './x.css'` is added in Phase 6 (§3.5).
- No business logic, no `window.crafterm`, no `state` imports inside `components/`. Pure UI.
- Feature-specific child components live under `screens/<feature>/components/` and *may* import services/state.

### 3.3 Reusable primitives to build (DRY collapse targets)

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
3. **`services/domain/*`** — pure business logic with no DOM and no IPC transport concerns (e.g. plan-filename parsing already in `main/planFilename.ts`; worktree path rules; time aggregation; token-usage math currently inline in main).

### 3.5 CSS strategy (Phase 6 — final phase, in scope)

> Done after the code structure lands. During Phases 1–5 `style.css` is left
> untouched and modules keep using its global classes; Phase 6 then executes the
> split below.

- **`components/tokens.css`** — promote the existing CSS custom properties (`--accent`, `--text-dim`, etc.) into one tokens file = the single source of design truth (color, spacing, radius, font). This is what guarantees UI consistency across reusable components.
- **Co-locate**: each component/screen owns its `.css`, imported from its `.ts`. Vite's bundler already supports `import './x.css'`.
- **Split `style.css`** (5,607 lines) along its existing section comments into the matching component/screen `.css` files. Mechanical, low-risk, done last (Phase 6) so it doesn't churn while modules move.
- One small `global.css` remains for resets, scrollbars, and `<html>`/`<body>` base.

### 3.6 Main (backend) service layer

Apply the proven `registerXIpc()` pattern (from db/docker/pr) to the whole of `index.ts`:

```
src/main/
  index.ts                 # ONLY: app lifecycle, window/pop-out creation, menu, wiring registerXIpc()
  ipc/                     # thin handler registration per domain
    pty.ipc.ts  git.ipc.ts  fs.ipc.ts  claude.ipc.ts  notebook.ipc.ts
    secrets.ipc.ts  plans.ipc.ts  store.ipc.ts  app-update.ipc.ts  sound.ipc.ts
  services/                # business logic (no ipcMain) — testable in isolation
    pty.manager.ts         # the Map<id,IPty>, spawn/kill/resize
    claude.usage.ts        # the ~100-line JSONL token aggregation (currently inline)
    git.service.ts  fs.service.ts  notebook.service.ts  plans.watcher.ts  secrets.service.ts
  windows/                 # BrowserWindow + pop-out creation, sendToRenderer/sendToOwner
  db.ts  docker.ts  pr.ts  planFilename.ts   # already clean — fold into ipc/+services/ naming
```

Target: `index.ts` drops from ~1,964 lines to a few hundred (lifecycle + wiring only).

### 3.7 Preload organization

Split `preload/api.d.ts` (609 lines, flat) and `preload/index.ts` into domain-grouped namespaces mirroring `services/ipc/` so the three-layer edit (handler ↔ preload ↔ type) stays aligned per domain. `window.crafterm` shape preserved (or grouped, e.g. `window.crafterm.git.*`) — decide in Phase 3 (see open questions).

---

## 4. Mapping: current file → target location

| Current | Target |
|---|---|
| `state.ts` | split → `core/state.ts` (singletons+hooks) + `services/storage/persistence.service.ts` + `core/render.ts` |
| `types.ts` | `core/types.ts` (+ per-domain type files as they grow) |
| `main.ts` | `app/main.ts` |
| `commands.ts` | `app/commands.ts` (thinned; pure logic → `services/domain/`) |
| `dialog.ts` | rebuilt on `components/modal`+`field`+`button` |
| `pickers.ts` (2,685) | `screens/pickers/<one folder per picker>` + uses `components/{modal,search-box,list}` |
| `settings.ts` (1,935) | `screens/settings/` + one child component per tab |
| `improve.ts` | `screens/improve-crafterm/` + `components/{feature-input,todo-card,progress-bar}` |
| `pane.ts` (1,286) | `screens/pane/` (split: terminal lifecycle vs activity/notification detection) |
| `sidebar.ts` | `screens/sidebar/` + child components |
| `treeview.ts/.css`, `contextmenu.ts` | `components/treeview/`, `components/context-menu/` |
| `tree.ts`, `catalog.ts`, `markdown.ts`, `themes.ts`, `palette-seed.ts`, `popout.ts` | stay as pure helpers (relocate under `core/` or keep flat) |
| `database.ts/.css`, `docker.ts`, `pr.ts`, `dbPane.ts/.css`, `diffPane.ts`, `filePane.ts`, `dbResultGrid.ts`, `sqlEditor.ts`, `notebook.ts/.css`, `reminders.ts`, `bookmarks.ts`, `dailyPlan.ts`, `explorer.ts`, `time.ts`, `accounts.ts`, `notifications.ts`, `content.ts` | `screens/<feature>/` each, with child components + co-located CSS |
| `main/index.ts` (1,964) | `main/index.ts` (lifecycle only) + `main/ipc/*` + `main/services/*` + `main/windows/*` |
| `preload/*` | domain-grouped namespaces |
| `style.css` (5,607) | split into co-located component/screen `.css` + `components/tokens.css` + `global.css` |

---

## 5. Phased migration (each phase ends compiling + running)

> Verification per phase (no test framework): `npx tsc --noEmit -p tsconfig.web.json` **and** `-p tsconfig.node.json`, then `npm run build`, then `npm run dev` + manual smoke of touched features.

**Phase 0 — Conventions & scaffolding** (low risk)
- Add `components/`, `screens/`, `core/`, `services/` dirs. Document the component contract (§3.2) in `docs/`.
- No CSS changes (tokens/co-location deferred — §3.5).

**Phase 1 — Reusable primitive library** (the DRY foundation)
- Build `overlay`, `modal`, `button`, `input`, `field`, `search-box`, `list`, `tabs` as `.ts` factories that **reuse existing `style.css` classes** (no co-located CSS yet).
- Relocate `treeview` and `context-menu` into `components/` (keep their existing `.css` files where they are for now).
- Rebuild `dialog.ts` on top of the new primitives (proves the library; keeps callers working).

**Phase 2 — Renderer service/data layer**
- Create `services/ipc/*.service.ts` wrappers; migrate feature modules off direct `window.crafterm.*` calls incrementally.
- Move persistence out of `state.ts` → `services/storage/persistence.service.ts`; move pure logic → `services/domain/`.

**Phase 3 — Backend service split**
- Apply `registerXIpc()` extraction to `index.ts`: pty, git, fs, claude, notebook, secrets, plans, store, app-update, sound → `main/ipc/*` + `main/services/*` + `main/windows/*`.
- Regroup `preload` per domain in lockstep. `index.ts` becomes wiring-only.

**Phase 4 — Feature → screen migration** (one feature per PR, easiest-first)
- Suggested order (small/standalone → large/central): `bookmarks` → `explorer` → `time` → `reminders` → `daily-plan` → `accounts` → `pr`/`diff-pane`/`file-pane` → `docker` → `database`/`db-pane` → `improve-crafterm` → `notifications` → `pickers` (split per picker) → `settings` (split per tab) → `sidebar` → `pane`/`content`.
- Each feature: move to `screens/<feature>/`, extract child components, co-locate CSS, route through services + primitives.

**Phase 5 — Dedup sweep**
- Delete now-dead ad-hoc modal/search/list code. Confirm every modal uses `components/modal`, every list uses `components/list`.

**Phase 6 — CSS reorganization** (final phase, in scope)
- Extract design tokens into `components/tokens.css`; import once globally.
- Co-locate each component/screen's CSS (`import './x.css'`), carving the matching sections out of `style.css` along its existing section-comment boundaries.
- Leave only a small `global.css` (resets, scrollbars, base). Verify visual parity section-by-section.

---

**Phase 7 — UI library adoption — DEFERRED (out of scope for now)**
- Later, if needed: pick one library from §6 and back chosen primitives with it behind the unchanged `createX()` API. Requires dependency approval.

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
- **No test framework** → rely on per-phase tsc + build + manual smoke; keep each PR small and feature-scoped. (Consider proposing a lightweight test setup separately — new dependency, needs approval.)
- **Native widgets** (xterm, CodeMirror, node-pty) → untouched by this plan; they stay imperative. This is the main reason to avoid React.
- **Import cycles** → preserved/extended via existing `hooks`/`paneActions` indirection; services import down, never up into screens.
- **CSS regressions during split** → do CSS split last (Phase 6), section-by-section, with visual diffing.
- **Plan-file sidebar attribution** → keep the `--pane-${CRAFTERM_PANE_ID}` suffix convention for any future plan files.

## 8. Open questions (resolve before Phase 3)
1. `window.crafterm` shape — keep flat (`crafterm.gitBranches`) or regroup into namespaces (`crafterm.git.branches`)? Namespacing is cleaner but touches every call site.
2. Do you want a test framework introduced (e.g. Vitest) as part of this work, or kept out of scope? (New dependency → needs approval.)
3. ~~UI library adoption~~ — **resolved: deferred** (revisit after structural refactor lands).

## 9. Out of scope (this round)
- **UI component library** — Franken UI / Shoelace / Fluent / daisyUI etc. (deferred, §6 / Phase 7).
- Functional/behavioral changes to features (this is a structure refactor only).
- Backlog items in `~/.crafterm/todo-list.json` (tracked separately).
- Packaging/distribution changes.
