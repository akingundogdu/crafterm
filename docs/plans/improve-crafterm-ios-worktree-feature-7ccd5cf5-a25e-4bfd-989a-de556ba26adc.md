# Crafterm — Worktrees as Real Sidebar Tree Nodes (generic + iOS)

## Context

The iOS worktree manager (v2) renders worktrees as flat status rows under a
project via the sidebar's `below` slot, and its actions open terminals with
`createTab(null, …)` — so those terminals land in the ungrouped "free" area,
disconnected from the project. That makes parallel work hard to track.

Target: worktrees become **real, auto-managed folder nodes** in the sidebar tree,
so terminals open *inside* the right worktree and persist/track like any other
terminal:

```
MusicPal ▸ mobile (project) ▸ worktrees ▸ akin-tf-release ▸ terminalX
```

This is **generic**, not iOS-only: a project gains a **"Support worktrees"**
toggle; any such project (e.g. backend) lists its `git worktree list` entries the
same way. **iOS is an add-on**: an iOS-enabled project additionally shows the
status dot + ▶/⋯ build-run action menu next to each worktree node (as today).

Hard constraint: **do not damage the user's existing folder structure** — only
nodes carrying explicit auto-markers are ever created/removed by reconcile.

Repo/branch: crafterm, `improve-crafterm`. crafterm already models a worktree as a
`FolderNode` with `feature` set (see `createFeature` in `commands.ts`, `WORKTREE_SVG`
icon in `sidebar.ts`), so this builds on an existing concept.

## Target structure & ownership

- **Container**: one auto folder per supported project, `worktreeContainer: true`,
  named "worktrees", inserted as a direct child of the project node.
- **Worktree node**: one auto `FolderNode` per `git worktree list` entry under the
  container, with `feature = branch` (existing marker → worktree icon) and a new
  `worktreePath = <abs path>` (the stable match key).
- **Terminals**: normal `TabNode`s parented under the worktree node — they persist,
  render, and drag like any terminal (reuses the whole tree machinery).

Depth: project → container(1) → worktree(2) → tab — within `MAX_FOLDER_DEPTH` (4).

## Data model (markers)

- `ProjectNode` (`types.ts`): add `supportWorktree?: boolean` (keep `iosApp?` /
  `iosConfig?`). Enabling `iosApp` implies `supportWorktree`.
- `FolderNode` (`types.ts`): add `worktreeContainer?: boolean` and `worktreePath?: string`.
- Persist in `serializeNode` (`state.ts`, project + folder branches) and read back in
  `buildSidebar` (`main.ts`); mirror in `SavedProject` / `SavedFolder` (`api.d.ts`).

## Reconcile — the heart (new `worktrees.ts`, generic)

`reconcileWorktrees()` — for each project with `supportWorktree` (or `iosApp`):
1. Find/create the `worktreeContainer` child (by marker, never by name → won't
   hijack a user "worktrees" folder). Reuse `makeFolder` (`tree.ts:193`),
   push onto the project node's `children`.
2. Fetch entries via `window.crafterm.listWorktrees(project.path)` (existing
   `git:worktrees` IPC). Include the main worktree (repo root) so it lists too.
3. For each entry, find a container child whose `worktreePath` matches; create a
   marked `FolderNode` (`feature = branch`, `worktreePath = path`, name = branch
   tail) if missing.
4. **Prune** only container children that have a `worktreePath` no longer present
   **and** are empty (`allTabs(node).length === 0`, `tree.ts:126`). Nodes with live
   terminals are kept (never kill the user's panes).
5. If anything changed → `requestSidebar()` + `saveSoon()`.

Safety: reconcile only ever touches nodes with `worktreeContainer`/`worktreePath`
markers — user folders/tabs are untouched. Auto nodes are non-renamable; the
container is non-draggable (sidebar adapter guards).

**Cadence**: run on load (in `main.ts` right after `state.tree = await buildSidebar(...)`,
~line 481), on toggling Support-worktrees on, after New/Remove worktree, and on a
slow interval (~20s) that only mutates when the git set actually changed. (iOS
status dots refresh separately, faster, without mutating the tree — see below.)

## Terminal parenting

Add `runInFolder(parentFolderId, dir, command, title)` to `commands.ts` (wraps the
existing internal `createTab(parentFolderId, {cwd, command, title})`). All worktree
actions use the worktree node's id as parent so terminals open *inside* it:
- iOS Build&Run / Device / Status / Clean → `runInFolder(node.id, worktreePath, '<IOSWT_* env> bash <script> <sub>', …)`.
- Generic "Open terminal here" and the folder's default "New terminal" → cwd =
  `node.worktreePath` (override the folder cwd in `newTerminal` `main.ts:78` and in
  `buildMenu` for worktree folders).

## iOS add-on (keep `ios-worktree.ts`, repurposed)

- Keep the `iosWorktree:report` poll (~5s) keyed by `worktreePath` for built/installed/
  running; it updates a cache and calls `requestSidebar()` — **no tree mutation**.
- Export helpers consumed by the sidebar adapter for a worktree folder whose owning
  project (`projectOf(state.tree, node.id)`, `tree.ts:212`) has `iosApp`:
  - status dot (leading), ▶ + ⋯ buttons (trailing), and context-menu items
    (Build&Run/Device/Stop/Status/Clean).
- Build "building" state tracked locally per `worktreePath` (set on launch, cleared
  when the report shows installed/running) → animated dot.

## Sidebar integration (`sidebar.ts`)

- **Remove** the `buildBelow` iOS flat-row branch and `renderIosWorktrees` flat list.
- Worktree folders now render as ordinary folder rows (worktree icon) via the
  TreeView; extend the adapter:
  - `leading`/icon: iOS status dot for iOS worktree folders.
  - `trailing` (`buildTrailing`): ▶ + ⋯ for iOS worktree folders; a "+" (new worktree)
    on the container.
  - `buildMenu`: worktree folder → Open terminal here (cwd = worktreePath) · Remove
    worktree (+ iOS actions when applicable); container → "New worktree…".
- New/Remove worktree run `git worktree add/remove` via `runInFolder` at the repo,
  then trigger a reconcile.

## Settings (`settings.ts`)

- Add a **"Support worktrees"** checkbox to the project editor (General or the iOS
  sub-tab). The existing iOS sub-tab stays for build config; toggling iOS on also
  sets `supportWorktree = true`.

## Critical files

- `src/renderer/src/types.ts` — `supportWorktree`, `worktreeContainer`, `worktreePath`.
- `src/renderer/src/state.ts` (`serializeNode`), `src/renderer/src/main.ts`
  (`buildSidebar` read-back + reconcile-on-load), `src/preload/api.d.ts`
  (`SavedProject`/`SavedFolder`).
- `src/renderer/src/worktrees.ts` (new) — reconcile, new/remove worktree, markers.
- `src/renderer/src/ios-worktree.ts` — repurpose to dot/actions/report helpers.
- `src/renderer/src/sidebar.ts` — adapter leading/trailing/menu; remove flat `below`.
- `src/renderer/src/commands.ts` — `runInFolder`.
- `src/renderer/src/settings.ts` — "Support worktrees" toggle.
- Reuse: `makeFolder`, `findById`, `projectOf`, `allTabs`, `depthOfFolder` (`tree.ts`);
  `createFeature` pattern (`commands.ts`); `git:worktrees` IPC; `WORKTREE_SVG`.

## Verification (no test framework — build + run + observe)

1. `npx tsc --noEmit -p tsconfig.web.json` and `-p tsconfig.node.json` clean; `npm run build`.
2. `npm run dev`. Existing `mobile` (iOS) project: on load a **worktrees** container
   appears with one folder per worktree; status dots + ▶/⋯ show on each.
3. ▶ Build&Run on a worktree → terminal opens **under that worktree folder** (not the
   free group), dot ◐→●. Open several → each terminal nests under its own worktree.
4. **+ New worktree** under the container → `git worktree add` runs at the repo path,
   the new folder appears after reconcile (no flat-list, no free-group terminal).
5. Enable **Support worktrees** on the **backend** project (no iOS): its worktrees
   list as folder nodes with Open-terminal/Remove menus and terminals nest inside —
   confirming the generic path.
6. Manually create a normal folder + terminal under a project, restart: reconcile
   leaves them untouched (only marked auto-nodes are managed). Remove a worktree in
   git → its empty node prunes on next reconcile; a worktree node with a live
   terminal is kept.
