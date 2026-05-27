# Plan: Live Plan-File Watcher + Per-Pane Ownership

## Background

Plan files (`docs/plans/<branch>-<slug>.md`) are shown as sub-nodes beneath
terminal panes in the sidebar. Two problems today:

1. **Stale list.** `refreshPaneInfo` only re-fetches plan files when `cwd` or
   `branch` changes (`pane.ts:710`). A newly created plan file is invisible
   until the user `cd`s away and back.
2. **No ownership.** Every pane sharing the same repo+branch shows the same
   plan list, so one plan appears beneath multiple unrelated panes (see the
   screenshot in this session: three panes all show `improve-crafterm-sql-pane`).

This plan fixes both.

## Goals

- Plan list updates live as files appear/disappear/rename on disk.
- A plan file is shown only beneath the pane that produced it.
- Ownership survives app restarts (pane gets a stable UUID).
- Legacy plan files (without the new suffix) keep current behavior — visible
  to every matching pane — so this is non-breaking for existing repos.

## Design Decisions (settled)

| Decision | Choice |
|---|---|
| Ownership identifier | Stable per-pane UUID (`pane.stableId`) persisted in state.json |
| Env channel to terminal | `CRAFTERM_PANE_ID` env var injected by main process on `pty:create` |
| Filename format | `<branch>-<slug>--pane-<stableId>.md` |
| Legacy plans | Files without `--pane-<id>` suffix → shown under every matching pane (fallback) |
| Live refresh | `fs.watch` per unique plans dir in main; broadcast `plans:changed` to renderer |
| File-watch dependency | Use built-in `node:fs.watch` — no new npm dependency |

### Filename format details

```
<branch-with-slashes-as-dashes>-<slug>--pane-<stableId>.md
```

Parser regex (renderer + main):

```ts
/^(?<prefix>.+)--pane-(?<paneId>[0-9a-f-]{36})\.(md|mdx|mdc)$/i
```

- The `--pane-` separator is the ownership delimiter.
- StableId is a v4 UUID (36 chars, lowercase hex + dashes).
- A file without `--pane-<uuid>` before the extension = legacy/unowned.

## Affected files

| File | Change |
|---|---|
| `src/renderer/src/types.ts` | Add `stableId: string` to `Pane`. Add `ownerStableId?: string` to plan tuple. |
| `src/renderer/src/state.ts` | Persist `stableId` per pane in `SavedState`; generate on creation if missing. |
| `src/preload/api.d.ts` | Update `plansForBranch` return shape: `{ name; path; ownerStableId: string \| null }[]`. Add `onPlansChanged(cb)` subscription. Add `stableId` field to saved pane shape. |
| `src/preload/index.ts` | Wire `onPlansChanged` to `ipcRenderer.on('plans:changed', …)`. |
| `src/main/index.ts` | (a) Inject `CRAFTERM_PANE_ID` into pty env when caller passes it via `opts.env`. (b) Rewrite `plans:forBranch` handler to parse ownership from filename and return `{ name, path, ownerStableId }`. (c) Add `plansWatchers: Map<string, FSWatcher>` keyed by plans dir; lazily start a watcher when a renderer first asks for that dir. (d) On any `fs.watch` event in that dir, debounce ~150 ms and emit `plans:changed` to all windows with `{ plansDir }` payload. (e) Close watchers on `before-quit`. |
| `src/renderer/src/pane.ts` | (a) `createPane` passes `CRAFTERM_PANE_ID: stableId` in env. (b) `refreshPaneInfo` no longer gates `plans` fetch behind cwd/branch change — fetch every time (cheap; main caches via fs.watch anyway). (c) New `refreshPlansForRepo(plansDir)` helper invoked from the `plans:changed` listener. |
| `src/renderer/src/main.ts` | Subscribe to `onPlansChanged` once at startup; on event, iterate panes whose `plansDir` matches and refresh them. |
| `src/renderer/src/sidebar.ts` | When rendering plans, filter: show a plan to a pane iff `plan.ownerStableId === pane.stableId` **or** `plan.ownerStableId === null` (legacy). |
| `CLAUDE.md` (project) | Document the new filename convention so future Claude sessions writing plan files include `--pane-${CRAFTERM_PANE_ID}` in the filename. |

## Implementation steps

1. **Stable pane ID**
   - Add `stableId: string` to `Pane` type and `SavedState` pane entries.
   - On `createPane`: if `opts.stableId` provided (restore), reuse it; else `crypto.randomUUID()`.
   - On restore in `main.ts`: pass the saved `stableId` through.
   - Migration: existing panes in `state.json` without `stableId` get one assigned on first load; `saveSoon()` persists.

2. **Env var injection**
   - `createPane` passes `env: { CRAFTERM_PANE_ID: stableId, ...opts.env }` to `createPty`.
   - Main process already forwards `opts.env` into the pty env (no change there) but add a guard so renderer-supplied `CRAFTERM_PANE_ID` always wins over any inherited value.

3. **Filename parser**
   - Pure helper `parsePlanFilename(fn, branch)` in a small new module
     `src/renderer/src/planFilename.ts` (also used by main via copy or by
     extracting to a shared file). Returns `{ slug, ownerStableId } | null`.
   - Main uses it inside `plans:forBranch` to attach `ownerStableId`.
   - Renderer uses the same module from `sidebar.ts` for any UI affordances
     (e.g. showing a "(legacy)" pill on unowned plans).

4. **Live watcher**
   - In main, on first `plans:forBranch` call for a given `plansDir`:
     - `mkdirSync(plansDir, { recursive: true })` then `fs.watch(plansDir, { persistent: false }, …)`.
     - Debounced (`150ms`) emit of `plans:changed` with `{ plansDir }`.
   - Track watchers in `Map<plansDir, FSWatcher>`; close them in
     `app.on('before-quit', …)` and on watcher `error` (with auto-reopen).

5. **Renderer event flow**
   - `preload` exposes `onPlansChanged((plansDir) => void): () => void` (unsubscribe).
   - `main.ts` (renderer) subscribes once and calls `refreshPlansForRepo`.
   - `refreshPlansForRepo` iterates `panes`, for each pane whose `cwd` resolves
     to the same git root + has a branch, re-fetches `plansForBranch` and
     diffs into `pane.plans`. Calls `requestSidebar()` if anything changed.
   - The 4-second periodic poll keeps `cwd`/`branch` detection working as
     today (unchanged), but plan fetching is no longer gated on it.

6. **Sidebar render filter**
   - In `sidebar.ts` `buildBelow()`, replace `firstPane.plans` use with a
     filtered slice: `plans.filter(p => p.ownerStableId == null || p.ownerStableId === firstPane.stableId)`.
   - If filtered list is empty, render nothing (don't show an empty
     `.tab-plans` container).

7. **CLAUDE.md update**
   - Add a short bullet under "Plan Files" explaining that plans created from
     within a Crafterm pane should use the
     `<branch>-<slug>--pane-${CRAFTERM_PANE_ID}.md` form so the sidebar can
     attribute them to the producing session.

8. **Verify**
   - `npx tsc --noEmit -p tsconfig.web.json` and `-p tsconfig.node.json` pass.
   - `npm run build` succeeds.
   - `npm run dev`: with two terminals open in the same repo on the same
     branch, create a plan via terminal A with the new filename → only
     terminal A shows it in the sidebar, within ~1s. Create a legacy-named
     plan → both terminals show it.

## Out of scope

- Migrating existing plan files to the new naming. They stay as legacy /
  shown-to-all until the user renames them.
- A UI to (re)assign ownership manually (right-click "Assign to this pane").
  Can be added later if the heuristic-via-filename proves insufficient.
- Watching nested directories under `docs/plans/`.
