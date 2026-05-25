# Plan: amux-sync-and-updater

## Context

Two related pieces of work, to be done in order on a single line of work
(no separate branches per the user's instruction):

1. **Port the Database / SQL-editor feature** from the sibling project
   `a-mux-terminal` into `crafterm`. The two trees diverged: `crafterm` is the
   canonical open-source repo (it has the logo/dock-icon, the new README, the
   `Crafterm` branding, and the OSS scaffolding), while `a-mux-terminal` kept
   getting feature work. A comparison of IPC channels shows the **only** new
   backend capabilities in `a-mux-terminal` are the DB feature (`db:*` + `dbq:*`)
   plus a tiny `plans:forBranch` helper — so a full tree merge is unnecessary and
   risky (it would clobber the logo/branding/README). We port just the DB feature.

2. **Self-update ("Update Crafterm")**: today `npm run deploy` quits the app
   mid-run when launched from a pane inside the app (the deploy script is a child
   of the app's PTY, so the app's own quit kills it). Add an in-app "Update"
   action that saves state, builds, and relaunches — with the heavy build shown
   in-app and only the quit→swap→relaunch detached so it survives the restart.

**Canonical decision:** `crafterm` stays canonical. We bring `a-mux-terminal`'s
DB feature *into* crafterm, rebranding its `window.amux` → `window.crafterm`
references. crafterm's logo, branding, README, and OSS files are untouched.

`a-mux-terminal` is at `/Users/akingundogdu/Documents/aaaaaa.my.code/a-mux-terminal`
(not a git repo). Reference line numbers below are from that tree at time of writing.

---

## Phase 1 — Port the Database / SQL-editor feature

The DB feature is a **third sidebar mode** (`terminal | notebook | database`)
with a connection tree (Postgres / MySQL / SQLite), a SQL editor, a results
grid, and saved queries.

### 1a. New files to copy (rebrand `window.amux` → `window.crafterm` on copy)

| Source (`a-mux-terminal`) | Dest (`crafterm`) | Notes |
|---|---|---|
| `src/main/db.ts` (233) | `src/main/db.ts` | `import Database from 'better-sqlite3'`; `DbEngine/DbConfig/DbResult/DbObjects` types; `registerDbIpc()` → `db:connect`, `db:objects`, `db:query`, `db:disconnect`. |
| `src/renderer/src/database.ts` (781) | same | `renderDatabase()`, `databaseNewProject()`; imports `sqlEditor` + `treeview`. |
| `src/renderer/src/sqlEditor.ts` (102) | same | `createSqlEditor()`. |
| `src/renderer/src/treeview.ts` (269) | same | `createTreeView()`, `TreeAdapter/TreeView/DropPos` types. |

### 1b. Wiring into existing crafterm files

Follow the established three-edit IPC pattern and four-edit persisted-setting
pattern (see `CLAUDE.md`).

1. **`src/main/index.ts`**
   - `import { registerDbIpc } from './db'` and call `registerDbIpc()` during init.
   - Add saved-query handlers + helpers: `dbqSlug`, `dbqDir`, `dbqSafe`, and
     `dbq:list / dbq:read / dbq:write / dbq:delete` (a-mux `index.ts:507-560`).
     These store `.sql` files under `stateDir()` (already `~/.crafterm` in crafterm —
     no path rebrand needed).
2. **`src/preload/index.ts`** — add `dbConnect`, `dbObjects`, `dbQuery`,
   `dbDisconnect`, `dbqList`, `dbqRead`, `dbqWrite`, `dbqDelete` (a-mux lines 63-70).
3. **`src/preload/api.d.ts`** — add `DbConfig/DbResult/DbObjects/DbEngine`,
   `SavedDbConnection`, `SavedDbNode`; the `db*`/`dbq*` method signatures
   (lines 300-307); `SavedState.dbTree?: SavedDbNode[]` (line 158);
   `DbConnection.database?` field.
4. **`src/renderer/src/types.ts`** — DB types block (`DbNode`, `DbConnection`,
   the database tree types; a-mux `types.ts:222-240`).
5. **`src/renderer/src/state.ts`** — persisted `dbTree` in lockstep:
   field `dbTree: [] as DbNode[]` (line 73); `persist()` entry (line 288);
   `loadSettings()` guard `if (Array.isArray(saved.dbTree)) …` (line 336).
6. **`src/renderer/src/sidebar.ts`**
   - `import { renderDatabase } from './database'`.
   - Extend `SidebarMode` to `'terminal' | 'notebook' | 'database'` (line 356).
   - `#tab-database` element + click → `setSidebarMode('database')` (lines 361-364).
   - `setSidebarMode`: toggle `mode-database` class, `tab-database.active`, search
     placeholder; render dispatch to `renderDatabase()`; key-nav guard
     "database view has no key-nav (v1)" (line 214).
7. **`src/renderer/src/main.ts`** — `import { databaseNewProject } from './database'`
   and wire its footer button / entry point (a-mux `main.ts:49`).
8. **`src/renderer/index.html`** — add the `#tab-database` sidebar-mode tab next to
   the terminal/notebook tabs.
9. **`src/renderer/src/style.css`** — extract the DB-related CSS blocks
   (`.mode-database`, treeview, sql editor, results grid) from a-mux's `style.css`.
   Do this by diffing the two `style.css` files and applying only the DB-scoped
   additions (avoid pulling unrelated/branding rule changes).

### 1c. Dependencies (native — flagged for approval)

- Add to `package.json`: `better-sqlite3` `^12.10.0` (dep) and
  `@types/better-sqlite3` `^7.6.13` (devDep).
- Update `rebuild` + `postinstall` scripts to `electron-rebuild -f -w node-pty -w better-sqlite3`.
- Add `**/node_modules/better-sqlite3/**` to `build.asarUnpack`.
- **Verify during implementation:** `db.ts` imports only `better-sqlite3`. The
  `postgres`/`mysql` engines may require `pg`/`mysql2` drivers that are not present
  in a-mux either — confirm whether those engines are functional or SQLite-only,
  and surface to the user before adding any further driver deps.

### 1d. Out of scope (this phase)

- `plans:forBranch` (a-mux's other small new channel) — not part of the DB
  feature; skip unless the user asks.
- Any non-DB micro-tweaks that exist only as line-level diffs in a-mux's shared
  files are intentionally **not** carried over (user chose "feature code only").

---

## Phase 2 — Self-update ("Update Crafterm")

Built on top of the Phase-1 result. Decisions already taken with the user:
crafterm canonical; in-app progress + restore overlay; repo path = a new setting,
asked once on first use; the app must run the build via a **login shell**
(`/bin/zsh -lic`) so `node`/`npm` are on PATH; main process restart is
unavoidable (PTYs die), so live processes restart while layout/cwd/Claude
(`--resume`) are restored.

### 2a. New persisted setting: `repoPath`

Four-edit lockstep (mirror `codeRoot`/`todoFile`):
`state.ts` field+default `repoPath: ''`; `persist()` payload; `loadSettings()`
guard `typeof saved.repoPath === 'string'`; `SavedState.repoPath?: string`
(`preload/api.d.ts`). Add a "Crafterm repo path" text field in
**Settings → Workspace** (`settings.ts`, via `labeledInput`, next to `codeRoot`).

### 2b. Menu entry

In `sidebar.ts` `showActionsMenu()` add `addItem('Update Crafterm', () => void runUpdate())`
(alongside "Improve Crafterm").

### 2c. `runUpdate()` flow (new code, likely in `commands.ts`)

1. Resolve repo: if `settings.repoPath` empty → open the folder-path picker
   (the Promise-returning one used by Settings → md folders, in `pickers.ts`);
   validate the chosen dir has `package.json` + `scripts/deploy.sh`; save to
   `settings.repoPath`; `saveSoon()`.
2. `promptConfirm({ title:'Update Crafterm', message:'Rebuild from source and
   restart? Layout, working dirs, and Claude sessions are restored; running
   processes restart.', confirmText:'Update & Restart' })` — abort if false.
3. Show an in-app progress modal (reuse `dialog.ts` modal styling) with steps:
   - **Saving sessions** → `persistNow()` (synchronous flush).
   - **Building new bundle** → `await window.crafterm.deployBuild(repoPath)`
     (runs in main, app stays alive; modal shows progress).
   - **Restarting** → `window.crafterm.deploySwap(repoPath)` then quit the app.
4. After relaunch, the new instance detects the update sentinel and shows a
   **"Loading sessions…"** overlay during restore, then a "Updated ✓" toast.

### 2d. New IPC (main `src/main/index.ts` + preload x2)

- `deploy:build` (`handle`): run `npm run build && npx electron-builder --dir` in
  `repoPath` via `execFile('/bin/zsh', ['-lic', …], { cwd: repoPath })`; stream/
  return `{ ok, error? }`. Locate the built `.app` under `dist/`.
- `deploy:swap` (`handle`/`on`): write the update sentinel
  (`~/.crafterm/.updating`), then spawn a **fully detached** helper
  (`spawn(..., { detached:true, stdio:['ignore', logFd, logFd] }); child.unref()`,
  log to `~/.crafterm/deploy.log`) that: waits until the `Crafterm` process exits
  (`pgrep -x Crafterm` loop), `rm -rf /Applications/Crafterm.app`,
  `cp -R <built app> /Applications/Crafterm.app`, `open` it. The app then quits
  normally (its existing two-phase quit persists state again as a backstop).
- Bridge both in `preload/index.ts` + `preload/api.d.ts`
  (`deployBuild(repoPath): Promise<{ok:boolean;error?:string}>`,
  `deploySwap(repoPath): Promise<boolean>`).
- This is the first use of `detached:true`/`unref()` in the codebase — that is the
  whole point: the swap+relaunch must outlive the app.

### 2e. Restore overlay + sentinel

On startup in `main.ts` restore path: if `~/.crafterm/.updating` exists, show a
"Loading sessions…" overlay until `buildLayout` finishes, then delete the
sentinel and flash "Updated ✓". (Sentinel keeps the overlay update-only, not
every launch.)

### 2f. Keep `scripts/deploy.sh`

Leave the existing script for manual CLI use. The in-app path reuses its logic
split across `deploy:build` (build) and the detached `deploy:swap` (quit→swap→relaunch).

---

## Verification

**Phase 1**
- `npm install` (pulls `better-sqlite3`) then `npm run rebuild` (rebuild
  `node-pty` + `better-sqlite3` against Electron).
- `npx tsc --noEmit -p tsconfig.web.json` and `-p tsconfig.node.json` — both clean.
- `npm run build`.
- `npm run dev`: switch to the **Database** sidebar mode; create a **SQLite**
  connection; browse objects; run a query (results grid); save a query and
  confirm it reloads; quit + relaunch and confirm `dbTree` persisted in
  `~/.crafterm-dev/crafterm-state.json`. Confirm no `window.amux` references
  remain (`grep -rn "window.amux" src` → empty).

**Phase 2**
- In a packaged build installed at `/Applications/Crafterm.app`: trigger
  **Update Crafterm**, confirm the folder picker appears on first use, the
  progress modal advances, the app quits, the detached helper swaps + relaunches,
  and the new instance restores sessions with the "Loading sessions… / Updated ✓"
  overlay. Confirm `~/.crafterm/deploy.log` captures output and that a build
  failure leaves the running app intact (script aborts before quit).

## Open risks / to confirm during implementation
- `better-sqlite3` is a new **native** dependency (needs electron-rebuild). Adding
  it is implied by "include the DB feature," but flag at PR time.
- Postgres/MySQL engine support may be incomplete without `pg`/`mysql2`; verify
  before claiming those engines work.
- `style.css` DB-CSS extraction is the fuzziest step — diff the two files and take
  only DB-scoped rules.
