# Crafterm — iOS Worktree Manager (sidebar-native, live status)

## Context

A first cut shipped the iOS worktree feature as a modal dashboard (a flat list of
worktrees with four identical buttons that each typed a raw bash build into a new
terminal). On testing it was confusing: no visible state (built? installed?
running? on which sim?), opaque execution, no guided creation, and a transient
modal with no place to manage parallel work.

This redesign turns it into a **sidebar-native manager with live status**: each
worktree of a project marked as an "iOS app" appears as a status row under that
project node in the existing sidebar, with one state-aware primary action and a
context menu. Decisions made with the user:
- Placement: **sidebar-native** (worktrees as rows under the iOS project node).
- Status: **live** — poll the simulator/device for installed/running state.
- Project binding: **per-project config** — each project node carries its own
  `iosApp` flag + `iosConfig`. There is **no** global config. Fully multi-project
  from the start: every iOS project has independent scheme/bundle/sim settings.
- "New feature": **create only** (worktree + bootstrap; user starts the build).

Repo/branch: crafterm, `improve-crafterm`. The bundled script and the
`iosWorktree:scriptPath` IPC from the first cut are **kept**; the **global**
`settings.iosDev` state and the global "iOS Mobile Development" Settings tab are
**removed** in favor of per-project config.

## Config model (per-project)

`ProjectNode` gains `iosApp?: boolean` and `iosConfig?: IosDevConfig`. `repoRoot`
is dropped — the project node's own `path` is the repo root. `IosDevConfig` fields
(all optional → auto-detected by the script when empty): `project`, `scheme`,
`baseBundleId`, `displayPrefix`, `defaultSimulator`, `copyFiles[]`, `worktreesDir`.
When a worktree action runs, its project's `iosConfig` is passed to the script as
`IOSWT_*` env (repo root = project path). Each iOS project is fully independent.

## Lifecycle & status dots

```
·  not built   →   ○ built   →   (installed)   →   ●  running        ◐ building
```
- not built: no `.app` under the worktree's `build/` DerivedData
- built: `.app` present
- installed: variant bundle id in `simctl listapps <sim>`
- running: variant in `simctl spawn <sim> launchctl list`
- building: a build pane for that worktree is in flight (renderer-tracked)

Dot priority: building > running > installed > built > not built.

## What changes

### 1. Remove the modal surface (first-cut leftovers)
- Delete `showIosWorktreeDashboard` from `src/renderer/src/pickers.ts` and the
  `iosWorktree` entries in `types.ts` (`BUILTIN_ACTIONS`) and `sidebar.ts`
  (`BUILTIN_ACTION_RUN`). The dashboard is replaced by inline sidebar rows.

### 2. Per-project iOS config (replaces global `settings.iosDev`)
- `src/renderer/src/types.ts` — add `iosApp?: boolean` and `iosConfig?: IosDevConfig`
  to `ProjectNode`. Keep the `IosDevConfig` interface but drop its `repoRoot` field.
- `src/renderer/src/state.ts` — remove the global `settings.iosDev` (init, persist,
  load). `serializeNode` (project branch, ~line 327) emits
  `...(node.iosApp ? { iosApp: true } : {})` and `...(node.iosConfig ? { iosConfig } : {})`;
  the project deserializer reads both.
- `src/preload/api.d.ts` — remove `SavedState.iosDev`; add `iosApp?` + `iosConfig?`
  to `SavedProject`.
- `src/renderer/src/settings.ts` — remove the global "iOS Mobile Development" tab
  (category list + `buildIosDevPanel`). Add an **"iOS"** sub-tab to the per-project
  editor (alongside General/Apps/Features/Run commands at `buildProjectsPanel`
  ~line 1067): an "iOS app" toggle that, when on, reveals the `iosConfig` fields
  (scheme/baseBundleId/displayPrefix/defaultSimulator/worktreesDir + copyFiles list),
  each bound to `p.iosConfig` + `saveSoon()`. Reuse `labeledInput` + the copyFiles
  list pattern from the old panel.

### 3. Bundled script: machine-readable report + stop
- `resources/scripts/ios-worktree.sh` — add two subcommands:
  - `report` — run at the repo root, enumerate `git worktree list` and print a
    JSON array `[{path, branch, bundleId, displayName, built, installed, running}]`
    (reuses the existing suffix/bundle-id derivation + `simctl listapps` /
    `simctl spawn <sim> launchctl list`). Single source of truth for id derivation.
  - `stop` — `simctl terminate <sim> <bundleId>` for the current worktree.

### 4. Live-status + action IPC (3-edit rule each)
- `src/main/index.ts` — add handlers that `execFile` the bundled script
  (path via the existing `scriptsDir()`): `iosWorktree:report` (cwd = repo root,
  IOSWT_* env from the passed config, returns parsed JSON) and `iosWorktree:stop`.
  Reuse the ~4s status `setInterval` (main.ts:311) cadence, or a renderer timer
  that only ticks while an iOS group is expanded.
- `src/preload/index.ts` + `src/preload/api.d.ts` — `iosWorktreeReport(repoRoot, cfg)`
  and `iosWorktreeStop(worktreePath, cfg)` signatures. `cfg` is the project's
  `iosConfig`; `repoRoot` is the project's `path`.

### 5. Sidebar rendering (the core UX)
- `src/renderer/src/sidebar.ts`:
  - Extend `buildBelow(node)` (currently `tab`-only) to also handle
    `node.kind === 'project' && node.iosApp`: render an **iOS Worktrees** block —
    one row per worktree with a status dot, name, a **▶ Build & Run** primary
    button, and a **⋯** menu (Build & Run · Run on device · Open Simulator · Stop ·
    Status · Clean · Open terminal here · Remove worktree). A trailing
    **+ New feature…** row, and a **Configure iOS app…** row when the project's
    `iosConfig` is unset (opens that project's Settings → iOS sub-tab).
  - Rows are populated from `window.crafterm.iosWorktreeReport(project.path, project.iosConfig)`
    (cached in a module-level map keyed by project id), refreshed on the poll tick
    via the coalesced `requestSidebar()`; building paths tracked in a renderer `Set`.
  - Actions reuse the existing "open a terminal at a path running a command"
    pattern: `openProject({ name, path, command: '<IOSWT_* env> bash <script> <sub>' }, null)`
    for Build & Run / device / status / clean (live output in a pane); `Stop` and
    `Open Simulator` call the IPC / `simctl` directly. The `IOSWT_*` env is built
    from the owning project's `iosConfig`.
  - Add iOS items to `buildMenu` for an `iosApp` project node (e.g. "Refresh iOS
    status", "Configure iOS app…").
- **New feature**: reuse/adapt `showFeatureSetup` (`pickers.ts:1236`) or a small
  prompt (branch + base) → `git worktree add` under the project's
  `iosConfig.worktreesDir` → bootstrap via the script's copy step. No auto build.

## Critical files

- `src/renderer/src/sidebar.ts` — `buildBelow` iOS block, `buildMenu` items, poll wiring.
- `src/renderer/src/types.ts`, `src/renderer/src/state.ts`, `src/preload/api.d.ts`
  — `iosApp` + `iosConfig` on the project (type + serialize + saved shape); remove
  global `settings.iosDev` / `SavedState.iosDev`.
- `src/renderer/src/settings.ts` — remove the global iOS tab; add a per-project
  "iOS" sub-tab with the toggle + config fields.
- `src/main/index.ts`, `src/preload/index.ts`, `src/preload/api.d.ts`
  — `iosWorktree:report` / `:stop` IPC.
- `resources/scripts/ios-worktree.sh` — `report` + `stop` subcommands.
- `src/renderer/src/pickers.ts`, `types.ts`, `sidebar.ts` — remove the old modal +
  `iosWorktree` builtin action.

Kept as-is: `scriptsDir()` + `iosWorktree:scriptPath`, and the script's
run/device/status/clean core (now fed per-project `IOSWT_*` env).

## Verification

crafterm has no test framework. Verify by:
1. `npx tsc --noEmit -p tsconfig.web.json` and `-p tsconfig.node.json` — clean.
2. `npm run build`, then `npm run dev`.
3. Add `musicpal-inc/pianopal-swift` as a sidebar project, open its Settings → **iOS**
   sub-tab, toggle **iOS app** on, optionally fill scheme/bundle (or leave blank to
   auto-detect). Add a second iOS project with its own config to confirm independence.
4. Expand the project → its worktrees appear as rows with status dots reflecting
   reality (run `report` shows installed/running for already-built variants).
5. **▶ Build & Run** on a worktree → a pane builds it, the dot goes `◐ → ●`, and a
   completion notification fires. Do it on a second worktree → both show `●` and run
   side-by-side on the same simulator.
6. **Stop** flips `● → ○`; **Clean** flips to `·`; **+ New feature…** adds a worktree
   row (no build); unconfigured state shows the "Configure iOS app…" row.
7. Confirm the status dots auto-refresh on the poll tick without manual action.
