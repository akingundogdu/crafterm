---
title: Backlog 20 — Easy → Hard Batch
branch: improve-crafterm
pane: 7cbb26b8-3e9e-4c2e-bc98-9b9e7236928a
session: c0569313-3bd1-4d8d-9d83-6bcb9481aa54
---

# Backlog 20 — Easy → Hard Batch

20 items from `~/.crafterm/todo-list.json`, ordered by implementation difficulty.
Workflow: implement one item at a time, await user approval, flip its status in
`~/.crafterm/todo-list.json` to **Ready to test**, move on. No batched edits
across items — one feature = one diff cycle.

After every item:
1. `npx tsc --noEmit -p tsconfig.web.json` and `npx tsc --noEmit -p tsconfig.node.json`
2. `npm run build`
3. `npm run dev` smoke-test the path
4. Bump status in `~/.crafterm/todo-list.json` (`In progress` → `Ready to test`)
5. Stop and wait for user verification before starting the next item

---

## Status board

| # | ID | Title | Bucket | Status |
|---|----|-------|--------|--------|
| 1 | todo45 | Files: right-click → Open in Finder | Easy | Backlog |
| 2 | todo49 | Projects: Save button + dirty indicator | Easy | Backlog |
| 3 | todo43 | Sub-project add-command keeps current sub-tab | Easy | Backlog |
| 4 | todo126 | Notification color = project color | Easy | Backlog |
| 5 | todo209 | Bookmark reminder click → open bookmark | Easy | Backlog |
| 6 | todo61b | Plan file appears under producing pane | Easy | Backlog |
| 7 | todo95 | Notification persistence audit (+ optional persist) | Medium | Backlog |
| 8 | todo94 | "Remind me" on terminal notification card | Medium | Backlog |
| 9 | todo18 | Files: click → split pane + nvim (md → markdown viewer) | Medium | Backlog |
| 10 | todo55 | Opt+Cmd+T picker → split into new pane | Medium | Backlog |
| 11 | todo56 | Claude name not recognized immediately | Medium | Backlog |
| 12 | todo81 | Improve modal: search across 3 categories | Medium | Backlog |
| 13 | todo29 | Disable Cmd+R reload entirely | Medium | Backlog |
| 14 | todo65 | Notebook item → "Remind me" with doc path payload | Medium | Backlog |
| 15 | todo66 | Active-screen-scoped keyboard shortcuts | Medium-Hard | Backlog |
| 16 | todo138 | Top status bar (collapse + claude usage) | Hard | Backlog |
| 17 | todo127 | Claude pane: "question" vs "done" detection | Hard | Backlog |
| 18 | todo58 | Accounts: per-project credential ledger | Big feature | Backlog |
| 19 | todo67 | Secrets storage (folded into Accounts) | Big feature | Backlog |
| 20 | todo59 | Spotlight-style global search Cmd+J | Big feature | Backlog |

---

## 1. todo45 — Files: right-click → Open in Finder

**Current state.**
`src/renderer/src/explorer.ts:38-61` defines an inline `showExcludeMenu(e, name)`
with a single "Exclude <name>" button; wired at `explorer.ts:101` via
`row.addEventListener('contextmenu', …)`. The shared `contextmenu.ts` system
exists but isn't used here. Main process already has the Finder primitive:
`src/main/index.ts:1030-1032` runs `shell.showItemInFolder(p)` under the
`notebook:reveal` channel.

**Plan.**
- Add a generic `files:reveal` IPC handler in `src/main/index.ts` calling
  `shell.showItemInFolder(absPath)`. Reuse the path-existence guard pattern
  already in `notebook:reveal`.
- Add `revealFile(path: string): Promise<void>` in `src/preload/index.ts` and
  the corresponding type in `src/preload/api.d.ts`.
- Replace `showExcludeMenu` in `explorer.ts` with a two-button menu (or move
  to `contextmenu.ts`'s `showContextMenu`):
  - **Open in Finder** → `window.crafterm.revealFile(absPath)`
  - **Exclude <name>** (existing behavior)
- Keep the menu DOM/CSS in line with the existing modal-overlay style.

**Files touched.** `src/main/index.ts`, `src/preload/index.ts`,
`src/preload/api.d.ts`, `src/renderer/src/explorer.ts`.

**Acceptance.** Right-click any file/folder row in the Files tab → see both
options → "Open in Finder" reveals it in macOS Finder; "Exclude" still works.

---

## 2. todo49 — Projects: Save button + dirty indicator

**Current state.**
`src/renderer/src/settings.ts:937-1046` builds the Projects detail panel.
Every input wires `input.addEventListener('change', …)` → `saveSoon()` at
`src/renderer/src/state.ts:195-217` (300ms debounce). There is no manual Save
button and no visible "modified" cue, so users can't tell if a change landed.

**Plan.**
- Add a sticky footer to the Projects detail panel (and each sub-tab) with:
  - A small **Saved · HH:MM:SS** / **Saving…** / **Unsaved changes** status
    chip, driven by a `dirty` flag and `state.lastSavedAt` (already implicit
    via debounce; expose explicitly).
  - A **Save now** button that calls `persistNow()` (already exported from
    `state.ts` for quit-time flushes) and updates the chip to Saved.
- Track dirtiness by replacing the inline `saveSoon()` calls with a thin
  wrapper `markDirtyAndSave()` (local to `settings.ts`) that flips the chip
  to **Saving…**, calls `saveSoon()`, and schedules a flip to **Saved** after
  the debounce window.
- Persist a `lastSavedAt` timestamp on every successful save (already happens
  in `state.ts`; surface it via a hook).

**Files touched.** `src/renderer/src/settings.ts`, `src/renderer/src/state.ts`
(expose save hook), `src/renderer/src/style.css` (chip styles).

**Acceptance.** Editing any Projects field shows **Unsaved → Saving… → Saved
HH:MM:SS** in under 500ms; clicking **Save now** forces an immediate flush.

---

## 3. todo43 — Sub-project add-command keeps current sub-tab

**Current state.**
`settings.ts:62-97` (`buildSubTabs`) initializes with `show(0)` on every call.
`settings.ts:886-935` (`renderRunCommands`) handles "Add command" by calling
`renderDetail()` (line 932), which `replaceChildren()`s the detail column and
rebuilds the sub-tab strip — defaulting back to tab 0.

**Plan.**
- Persist the **active sub-tab index per project** in a renderer-local map:
  `const activeSubTabIdx = new Map<string, number>()` keyed by
  `projectNodeId`.
- Change `buildSubTabs` signature to `buildSubTabs(parent, tabs, initialIdx)`;
  call `show(initialIdx ?? 0)` instead of always 0.
- In `renderDetail()`, look up the saved idx via the active project's id and
  pass it through. Update the map whenever a tab is clicked (a tiny callback
  passed into `buildSubTabs`).
- Additionally, in "Add command" do **not** call full `renderDetail()`; call
  the narrower `renderRunCommands()` so the sub-tab strip isn't rebuilt at
  all. Both fixes are belt-and-suspenders — adding-command-in-place is the
  real cure, the persisted index is the fallback.

**Files touched.** `src/renderer/src/settings.ts`.

**Acceptance.** With a sub-project's "Run commands" sub-tab open, clicking
**Add command** keeps focus on Run commands; the same holds for Apps and
Features sub-tabs.

---

## 4. todo126 — Notification color = project color

**Current state.**
`notifications.ts:102-105` paints cards by `kind`/`event` only (blue/amber/
green). `types.ts:336-343` `AppNotification` carries `group: string` and
`paneId: string` but no project color. `types.ts:133-140` `ProjectNode` has a
`color: NodeColor` field. The renderer side has access to `state.tree`.

**Plan.**
- Extend `AppNotification` with `projectColor?: string` (hex). Set it at
  push-time by looking up the producing pane's project (already known —
  `pane.projectId` or by walking `state.tree` from `pane.cwd`/`pane.group`).
  Resolve the color from the matching `ProjectNode.color`.
- In `notifications.ts` card renderer, apply the project color as the card's
  left-border accent (`border-left: 3px solid var(--accent)` style),
  preserving the state-based tint as the fill so question/done still read.
  Fall back to the current state-based color when `projectColor` is absent.
- Add a small "Match project colors" toggle in `Settings → General` (default
  on) so users can revert.

**Files touched.** `src/renderer/src/types.ts`, `src/renderer/src/pane.ts`
(pushNotification call sites), `src/renderer/src/notifications.ts`,
`src/renderer/src/style.css`, `src/renderer/src/settings.ts` (toggle),
`src/renderer/src/state.ts` (toggle persistence).

**Acceptance.** A notification fired from a pane whose project has
`color = #ff8800` shows a clearly orange left border; toggling the setting
off restores green-only.

---

## 5. todo209 — Bookmark reminder click → open bookmark

**Current state.**
`bookmarks.ts:139-171` creates reminders via `snoozeReminder("Bookmark: …",
opt.at)` — only text is carried. `reminders.ts:104` fires the reminder and
calls `pushNotification({ kind: 'reminder', reminderText: r.text })` — still no
bookmark id. `notifications.ts:155-166` renders reminder cards with snooze
buttons only and no click handler.

**Plan.**
- Extend the `Reminder` type with `payload?: { kind: 'bookmark', bookmarkId: string }`
  (broaden later for notebook items — see todo65).
- Update `snoozeReminder()` and `showRemindPicker()` in `bookmarks.ts` to pass
  the payload through.
- On reminder fire (`reminders.ts:104`), copy the payload into
  `AppNotification` (`payload?: …`).
- In `notifications.ts` reminder card branch, when `payload?.kind === 'bookmark'`:
  - Add an **Open** button (left of the snooze chips) that resolves
    `bookmarkId` via `settings.bookmarks`, then calls `openLink(bm.content)`
    (already imported from `commands.ts`).
  - Also make the card body itself clickable to invoke the same handler.
- Migration: existing reminders without a payload behave as today.

**Files touched.** `src/renderer/src/types.ts`,
`src/renderer/src/reminders.ts`, `src/renderer/src/bookmarks.ts`,
`src/renderer/src/notifications.ts`.

**Acceptance.** Setting a reminder on a link bookmark, when it fires, shows a
card with an **Open** button that opens the link in the in-app browser;
clicking the card body does the same.

---

## 6. todo61b — Plan file appears under its producing pane

**Current state.**
- `main/index.ts:577-597` `plans:forBranch` reads `docs/plans/`, parses each
  filename with `parsePlanFilename(f, branch)`, and drops anything without
  `ownerStableId` (line 590).
- `pane.ts:763-771` `refreshPanePlans()` calls the IPC and stores into
  `pane.plans`.
- `sidebar.ts:468-482` `plansForTab()` filters by `pane.stableId === plan.ownerStableId`.
- `sidebar.ts:556-580` renders plans **only when `node.detailsOpen` is true**.
- Pane spawn injects `CRAFTERM_PANE_ID` (`src/main/index.ts` pty spawn block).

**Plan.**
- Verify `parsePlanFilename` handles the `--pane-<UUID>` suffix exactly as
  written in CLAUDE.md and as Crafterm injects (no trailing dash, full UUID).
  Add a log-once warning in main when a `docs/plans/*.md` file fails the
  parse, surfaced to the renderer as a notification so the user sees why a
  plan didn't attach.
- In the sidebar, show plans **without requiring detailsOpen** — render a
  small "📄 N" chip on the pane row when `pane.plans.length > 0`; clicking it
  flips detailsOpen and scrolls to the plans list. This makes the link
  discoverable.
- Audit the watcher: `fsWatch(plansDir, …)` (around `main/index.ts:550-570`)
  must `recursive: true` only if we ever support nested plans; today plans
  live flat in `docs/plans/`. Confirm the watch fires on `create` events on
  macOS (chokidar would be safer; assess switching only if `fs.watch` proves
  flaky).
- If still not visible, the issue is likely `pane.cwd`/`pane.branch` mismatch
  vs the plan's branch in filename. Add a debug IPC `plans:debugScan` that
  returns all parsed plan entries plus the reasons each was filtered, so we
  can diagnose without printf debugging.

**Files touched.** `src/main/index.ts`,
`src/renderer/src/sidebar.ts`, `src/renderer/src/pane.ts`,
`src/renderer/src/style.css`.

**Acceptance.** Creating a file `docs/plans/improve-crafterm-foo--pane-<paneId>.md`
inside an active pane causes the sidebar to show a 📄 chip on that pane row
within ~1 second; clicking the chip expands the plans list.

---

## 7. todo95 — Notification persistence audit (+ optional persist)

**Current state.**
`state.ts:20-22` declares `notifications: AppNotification[] = []` with comment
"session-only, never persisted". `state.ts:140-143` `pushNotification()` caps
at 100 in-memory entries and re-renders. `persist()` (`state.ts:292-328`) does
not include notifications, and `SavedState` (`preload/api.d.ts:152-244`) has
no field for them.

**Plan.**
This is partly an audit, partly a feature.
- **Audit deliverable:** add a clear comment block at `state.ts:20` confirming
  the design (session-only, capped at 100, rendered via `hooks.renderNotifications()`,
  cleared on app quit). Document this in `docs/features.md` so the answer
  isn't only in code.
- **Feature:** persist **only un-dismissed** notifications from the last 24h:
  - Add `notifications: AppNotification[]` to `SavedState` (cap at 50 on
    write).
  - On load, hydrate `state.notifications` with entries whose
    `ts > Date.now() - 24h`; drop the rest.
  - On `dismissNotification(id)`, mark as dismissed and exclude from persist.
- **TTL/cleanup:** add a tick (60s) that prunes dismissed/old notifications
  from the in-memory array.

**Files touched.** `src/renderer/src/state.ts`,
`src/preload/api.d.ts`, `src/renderer/src/types.ts` (add optional
`dismissed: boolean`), `docs/features.md`.

**Acceptance.** Restarting Crafterm with 3 fresh, un-dismissed notifications
shows the same 3 cards after relaunch; dismissed ones do not reappear; cards
older than 24h are pruned.

---

## 8. todo94 — "Remind me" on terminal notification card

**Current state.**
`notifications.ts:100-169` builds cards: lines 155-166 render snooze buttons
only when `n.kind === 'reminder'`; non-reminder cards (pane activity) have a
click handler that calls `selectPane()` + `dismiss()` but no Remind action.
`bookmarks.ts:139-171` `showRemindPicker(bm)` is a working precedent that
opens a snooze-style picker.

**Plan.**
- In `notifications.ts`, for non-reminder cards, add a small **⏰ Remind me**
  icon-button next to the close (×) button. Wire to a generalized
  `showRemindPicker({ title, payload? })` extracted from `bookmarks.ts` into
  `reminders.ts` (so notebook/bookmark/pane all share one picker).
- For pane notifications, the payload is `{ kind: 'pane', paneId }`. When the
  reminder fires later, the card's Open button calls `selectPane(paneId)` (no
  bookmark coupling needed).
- Reuse the snooze chip presets from `reminders.ts:49-67`.

**Files touched.** `src/renderer/src/reminders.ts` (extract shared picker),
`src/renderer/src/bookmarks.ts` (use shared picker),
`src/renderer/src/notifications.ts` (add button), `src/renderer/src/style.css`.

**Acceptance.** A terminal "done" notification shows a ⏰ button next to ×;
clicking it opens the time-picker; selecting "in 1h" creates a reminder; when
it fires, an **Open** button on the new card jumps to that pane.

---

## 9. todo18 — Files: click → split pane + nvim (md → markdown viewer)

**Current state.**
`explorer.ts:31-34` `openFile(path)` checks extension: markdown → in-app
viewer; else → `window.crafterm.ideOpen(path, settings.commands.ide)`.
`main/index.ts:516-520` `ide:open` runs the IDE command via zsh.
`commands.ts:757` `openMarkdownFile()` actually splits the pane and places a
DocPane via `paneActions.split`. The "ide" path does **not** split — it just
fires a shell command that may or may not be a TUI editor.

**Plan.**
- Change non-markdown click behavior: instead of `ideOpen` (which is global,
  detached), spawn a terminal in a new split pane and run
  `${settings.commands.ide} ${shq(path)}` as its initial command:
  - Reuse the pattern from `commands.ts` (worktree-shell / project run-cmd):
    `paneActions.splitPane({ initialCommand })`.
  - The split pane inherits the current pane's cwd so relative paths work.
- Markdown / `.md` / `.mdc` keep going through `openMarkdownFile()` (in-app
  viewer).
- Keep `ideOpen` IPC for any external use, but the Files tab no longer calls
  it.
- Add a small **Settings → General → "Open files in"** dropdown:
  - **Split pane with `${ide} <file>`** (default, the new behavior)
  - **External (`${ide}` opens its own window)** — legacy `ideOpen`
  - **Markdown viewer for everything** — for power readers

**Files touched.** `src/renderer/src/explorer.ts`,
`src/renderer/src/commands.ts` (helper to split-with-initial-command if not
already there), `src/renderer/src/settings.ts`,
`src/renderer/src/state.ts` (new setting field).

**Acceptance.** Clicking `index.ts` in the Files tab opens a new split pane
running `nvim index.ts` in the current cwd; clicking `README.md` opens the
markdown viewer; switching the setting reproduces legacy behavior.

---

## 10. todo55 — Opt+Cmd+T picker → split into new pane

**Current state.**
`keybindings.ts:12-30` has `cmd+t` but no `opt+cmd+t`. `commands.ts:561-573`
`splitPane()` already creates a split. `pickers.ts:492-550`
`showProjectPicker()` already supports `{ split: true }` and is used by
`paneActions.splitWithProject` (`main.ts:128-131`).

**Plan.**
- Add a new global keybinding `opt+cmd+t` → "Split with picker". The action:
  - Open a unified picker (`pickers.ts` — extend the existing project picker
    or wrap it as `showSplitPicker()`) that lists **projects, worktrees, ssh
    targets, and run commands** (mirror what the command palette offers but
    scoped to "things you'd want to open in a new pane").
  - On selection, call `paneActions.splitPane({ initialCommand })` with the
    appropriate command (cd + run for project, ssh for ssh, etc.).
- The new picker reuses the existing entry shape (`openTab`/`openSplit`) and
  always invokes the split path.
- Keep `Cmd+T` (existing) for the legacy "new tab in current pane" flow.

**Files touched.** `src/renderer/src/keybindings.ts`,
`src/renderer/src/pickers.ts`, `src/renderer/src/commands.ts`,
`src/renderer/src/main.ts` (wire action).

**Acceptance.** Inside any active pane, pressing **Opt+Cmd+T** opens a
picker; selecting a project spawns a new split next to the current pane in
that project's cwd; Cmd+T behavior is unchanged.

---

## 11. todo56 — Claude name not recognized immediately

**Current state.**
`pane.ts:743-756` `onPaneTitle(pane, raw)` updates title from xterm OSC
sequences only. `pane.ts:774-802` `refreshPaneInfo()` runs on a tick and locks
the Claude session id when `pane.claude && pane.cwd && !pane.claudeSessionLocked`.
`commands.ts:1169-1177` `autoNameTab()` copies pane title to tab on user
action. Recent feature "Smarter Claude Titles" reads custom title from Claude
session jsonl (`main/index.ts:406-474` `claude:sessions` reads jsonl files).

**Plan.**
- When a pane is detected as Claude (`pane.claude = true`) and a session id is
  locked, **proactively** read the latest jsonl line for that session and
  extract the custom title if present (Claude writes a "title" field at the
  top of its jsonl). Today this seems to lag a tick or two.
- Add an IPC `claude:sessionTitle(sessionId): Promise<string|null>` that
  reads the file once. Renderer calls it right after session lock in
  `refreshPaneInfo()` and updates `pane.title` immediately, then schedules a
  short re-check at 1s + 3s in case Claude writes the title slightly later.
- Cache results to avoid repeated reads (`Map<sessionId, { title, ts }>` in
  main).
- Surface "auto-title from Claude" as a setting (default on) so the user can
  fall back to xterm-title-only.

**Files touched.** `src/main/index.ts`,
`src/preload/index.ts`, `src/preload/api.d.ts`,
`src/renderer/src/pane.ts`.

**Acceptance.** Opening a new Claude pane and typing a custom title in
Claude reflects in the sidebar pane title within ~1s, not after multiple
seconds or a manual auto-name action.

---

## 12. todo81 — Improve modal: search across 3 categories

**Current state.**
`improve.ts:187-365` `showImproveModal()`: tab-based (Todo / Ready / Done);
no search bar; Cmd+1/2/3 switch tabs; stats div at line 279-282; no filter.

**Plan.**
- Add a search input pinned in the modal header (right of the title, left of
  "Request new feature").
- When the input is non-empty, switch from tab-mode to a **flat results
  view**:
  - Hide tab buttons; render three sections (Todo / Ready / Done) stacked,
    each filtered by case-insensitive substring match on item text.
  - Section headers stay visible even when empty for that section (with a
    "0 results" greyed line), so users see scope at a glance.
- Clearing the search restores the previous tab. Pressing Esc inside the
  input first clears the query (single press) then closes the modal (second
  press).
- Persist last-query in `settings.improve.lastQuery` for session continuity
  (cleared on modal close).

**Files touched.** `src/renderer/src/improve.ts`,
`src/renderer/src/style.css`.

**Acceptance.** Typing "remind" in the search box shows every todo / ready /
done item containing "remind" across all categories simultaneously; clearing
the box restores normal tab behavior.

---

## 13. todo29 — Disable Cmd+R reload entirely

**Current state.**
`src/main/index.ts:1132-1166` builds the menu via `Menu.buildFromTemplate`
and replaces the app menu via `Menu.setApplicationMenu()`. The template
includes `{ role: 'viewMenu' }` (line ~1139) — Electron's `viewMenu` role
auto-includes Reload (Cmd+R) and Force Reload (Shift+Cmd+R). Hence the user
hits Cmd+R and the whole renderer reloads, losing pane state.

**Plan.**
- Replace `{ role: 'viewMenu' }` with an explicit custom View submenu
  containing only the items we want (Zoom, Toggle Devtools, full-screen),
  excluding Reload / Force Reload entirely.
- Belt-and-suspenders: intercept Cmd+R at the web-contents level so devtools
  reload accelerators or stray bindings don't sneak through:
  `app.on('web-contents-created', (_, wc) => wc.on('before-input-event', (e, input) => { if ((input.control || input.meta) && input.key.toLowerCase() === 'r') e.preventDefault() })`
- Also check `src/main/index.ts` BrowserWindow options for any explicit
  `webPreferences.allowReload`-style config and remove if present.

**Files touched.** `src/main/index.ts`.

**Acceptance.** Pressing Cmd+R in the renderer with 4 panes open does
nothing — no reload, no flicker; Shift+Cmd+R same. Devtools toggle still
works.

---

## 14. todo65 — Notebook item → "Remind me" with doc path payload

**Current state.**
`notebook.ts:71-81` `buildMenu(n)` builds the context menu: today only
"Show in Finder" and "Rename" (and similar). No "Remind me" action.
`bookmarks.ts:139-150` already has the picker pattern; in item #5 above we
extended the `Reminder.payload` shape and in item #8 we extracted the
picker into `reminders.ts`.

**Plan.**
- Add a **Remind me…** entry to the notebook context menu.
- On click, open the shared picker (extracted in item #8) with
  `{ title: notebook node name, payload: { kind: 'notebook', path: absPath } }`.
- In `notifications.ts` reminder-card render, when `payload?.kind === 'notebook'`,
  show an **Open** button that calls `openNote(path)` (already in
  `commands.ts`).
- Visually show the doc path as a chip on the reminder card (truncated) so
  the user knows what it's about before opening.

**Depends on:** items 5 (payload type) and 8 (shared picker).

**Files touched.** `src/renderer/src/notebook.ts`,
`src/renderer/src/notifications.ts`, `src/renderer/src/reminders.ts`,
`src/renderer/src/types.ts`.

**Acceptance.** Right-clicking a notebook item → **Remind me… → in 1h**
creates a reminder; when it fires the card shows the doc path chip and an
Open button that opens the note.

---

## 15. todo66 — Active-screen-scoped keyboard shortcuts

**Current state.**
`src/renderer/src/main.ts:228-267` is a single global keydown handler in
capture phase. Special-cases like notebook mode (line 234) are inline but
modal-awareness is absent. `improve.ts:187-227` opens a modal and registers
its own capture-phase listener, but does not call `stopPropagation()`. As a
result, with the Improve modal open, Cmd+N triggers `notebookNewNote()`.

**Plan.**
- Introduce a tiny **active scope** state in `state.ts`:
  - `state.activeScope: 'global' | 'improve' | 'picker' | 'settings' | 'docPane' | ...`
  - Default `'global'`; modals set it on open and restore on close (managed
    by a small `pushScope/popScope` stack).
- Refactor the global `KEYBINDINGS` array (`keybindings.ts:12-30`) to entries
  shaped `{ combo, action, scopes?: Scope[] }`. Default behavior: shortcut
  fires only in `'global'`. Scope-specific shortcuts (e.g. Cmd+1/2/3 in
  Improve) bind to that scope.
- Update `main.ts:228-267` dispatch to consult `state.activeScope` before
  firing any handler. Notebook-new-note Cmd+N becomes
  `scopes: ['global']`, so it never fires in `'improve'`/`'picker'`.
- Improve / pickers / settings modals push their scope on open, pop on close.
- Add a debug DOM attribute `<body data-scope="…">` for easy inspection.

**Files touched.** `src/renderer/src/state.ts`,
`src/renderer/src/keybindings.ts`, `src/renderer/src/main.ts`,
`src/renderer/src/improve.ts`, `src/renderer/src/pickers.ts`,
`src/renderer/src/settings.ts`, others that open modals.

**Acceptance.** With the Improve modal open, Cmd+N does **not** open a new
note. Closing the modal restores normal Cmd+N. Settings modal Esc closes the
modal (does not blur a terminal pane).

---

## 16. todo138 — Top status bar (collapse + claude usage)

**Current state.**
`src/renderer/index.html:9-159` has `#app` containing `#sidebar`,
`#sidebar-resizer`, `#content`, right notification panel. There is no
top-spanning bar — only a `#collapsed-topbar` that appears when sidebar is
hidden. Collapse buttons live inside the sidebar (`sidebar.ts:113-124`).
Claude usage is **not** currently exposed via any IPC.

**Plan.**
- Introduce a slim 28-32px high `<header id="status-bar">` at the very top of
  `#app` (sibling of the rest), always visible. Sections:
  - Left: **[‹]** collapse-left / **[›]** show-right toggles.
  - Center: drag region (`-webkit-app-region: drag`) so the user can move the
    window from here.
  - Right: **Claude usage chip** — model, today's input/output tokens,
    optional cost estimate. Tooltip shows breakdown by session.
- New IPC `claude:usageSummary(): Promise<{ model, inTok, outTok, costUsd }>`
  that scans `~/.claude/projects/**/usage.jsonl` (or whichever file Claude
  uses today; pin down the exact path during research before building).
  Cached for 30s.
- Re-style `#sidebar-hide` / `#sidebar-show` to live in the status bar so
  there's a single home for window-wide toggles. Keep the existing
  `#collapsed-topbar` for backwards compatibility or remove it (cleaner).
- Status bar height counts against `#content` via a CSS grid / flex
  adjustment.

**Files touched.** `src/renderer/index.html`,
`src/renderer/src/style.css`, `src/renderer/src/main.ts`,
`src/renderer/src/sidebar.ts`, `src/main/index.ts` (new IPC),
`src/preload/index.ts`, `src/preload/api.d.ts`.

**Acceptance.** The app shows a slim top bar at all times; clicking the left
chevron collapses the sidebar; the right side shows "claude-sonnet-4-6 ·
12.3k in / 4.1k out · $0.12" updated every ~30s. Layout regressions: none.

---

## 17. todo127 — Claude pane: "question" vs "done" detection

**Current state.**
`pane.ts:715-741` `notifyPane(pane, body, event)` already takes
`event: 'question' | 'done'`. Bell `onBell()` fires `'question'`; long-quiet
inactivity fires `'done'`. There is **no parsing of the actual buffer** to
distinguish "Claude is waiting for permission / a yes/no" from "task
complete".

**Plan.**
- Add a lightweight buffer-tailing analyzer in `pane.ts` (only active for
  panes where `pane.claude === true`):
  - Maintain the last N lines of stripped ANSI text (say 24).
  - On `'done'` candidacy (long quiet + Claude pane), scan the tail for
    "question" cues:
    - Lines ending in a `?`
    - Common Claude permission strings (e.g. "Allow this", "Do you want me
      to", "Continue?", "Would you like…")
    - The bottom prompt frame containing input cursor in interactive mode
  - If matched, re-classify the event from `'done'` → `'question'`.
- Extend notifications card render to give "question" a distinct visual
  (amber border + ❓ glyph) separate from "done" (green ✅) — the field
  already exists on `AppNotification.event`.
- The matcher is intentionally heuristic; ship behind a setting "Detect
  Claude questions" (default on).

**Files touched.** `src/renderer/src/pane.ts`,
`src/renderer/src/notifications.ts`, `src/renderer/src/types.ts`,
`src/renderer/src/settings.ts`, `src/renderer/src/state.ts`.

**Acceptance.** When Claude finishes a turn waiting for "Do you want to
continue?", the right-panel card shows ❓ amber, not the default green
"done" tile.

---

## 18. todo58 — Accounts: per-project credential ledger

**Big feature; brainstorm first, then plan in detail.**

**Brainstorm.**
- "Accounts" = a structured ledger of services the user uses for dev work
  (GitHub, AWS, npm, OpenAI, Cloudflare, Vercel, Linear, Slack, …).
- Each row: service name, account name/email, username, password (optional,
  encrypted), notes, MFA hint, plus arbitrary key/value pairs (e.g. SSH key
  path, AWS profile name).
- Per-project: an account can be **tagged** to one or more projects so
  filters work — "show me everything tied to Crafterm".
- Sensitive fields stored via Electron `safeStorage` (no new dep) — keyed by
  a per-row UUID. The JSON store keeps only the UUID + the non-secret
  metadata. Fall back to `keytar` if `safeStorage` proves insufficient (ask
  user before adding the dep).

**Plan.**
- New sidebar mode **Accounts** (extend `sidebar.ts:304` `SidebarMode`
  union). Sidebar lists accounts grouped by service or by tag.
- Right-side detail panel (replacing the pane content area, or in a modal —
  match how Database mode handles this) shows the account form.
- Persist accounts under `SavedState.accounts: AccountEntry[]` where
  `AccountEntry = { id, service, label, login, url?, notes?, tags: string[],
  fields: { key, value, secret: boolean }[] }`. Secret values resolve via
  Keychain/safeStorage at read-time and are never JSON-persisted.
- Add IPC `secrets:get(id, key)`, `secrets:set(id, key, value)`,
  `secrets:delete(id, key)` wrapping `safeStorage`.
- Tab in the Accounts row: a quick **Copy password** button, masked in the
  UI.
- Integrate with todo67 secrets (next item): they share the same secrets
  channel; UI lives under Accounts.

**Files touched.** `src/main/index.ts` (secrets IPC),
`src/preload/{index.ts,api.d.ts}`, `src/renderer/src/sidebar.ts`,
`src/renderer/src/state.ts`, `src/renderer/src/types.ts`, new
`src/renderer/src/accounts.ts` and css.

**Acceptance.** A new Accounts sidebar mode appears; user adds a GitHub
entry with a password; password is never readable from
`~/.crafterm/crafterm-state.json` (only the UUID is); clicking Copy
copies the actual value via the IPC bridge.

---

## 19. todo67 — Secrets storage (folded into Accounts)

**Plan.**
Most of the storage layer is built in item 18. This item is the **higher-level
secrets surface**:
- "Secrets" = named env-var-like entries used by tooling (GH_TOKEN,
  ANTHROPIC_API_KEY, OPENAI_API_KEY). Distinct UX from full account rows.
- Add a "Secrets" sub-tab inside the Accounts mode (or a dedicated entry
  type `{ kind: 'secret' | 'account' }`).
- For each secret: `name`, `value` (Keychain-stored), `usedBy: string[]`
  (project tags), `lastUsed`.
- Expose IPC `secrets:listNames(projectId?)` so the Project Settings
  Environment sub-tab (`settings.ts`) can reference them: instead of
  pasting GH_TOKEN value into project env, the user picks "from secret:
  GH_TOKEN" and the env var is injected at pty spawn (`main/index.ts` env
  block).
- Surface a **🔒 Secrets** chip in the top status bar (built in item 16)
  showing count of stored secrets and a click-to-open shortcut.

**Files touched.** Same set as item 18 + `src/main/index.ts` pty env
injection.

**Acceptance.** User adds a secret `GH_TOKEN=ghp_…` once in Accounts → it
appears as an option in Project → Environment sub-tab → panes spawned in
that project see `$GH_TOKEN` exported without the value ever appearing in
the JSON store.

---

## 20. todo59 — Spotlight-style global search Cmd+J

**Brainstorm.**
- Want: fuzzy search across **projects, features, panes, recent commands,
  notebook docs, bookmarks, plan files** — a single dispatcher.
- Bind to **Cmd+J** (Cmd+/ collides with monaco / nvim users). Confirm
  before commit; otherwise Cmd+Shift+O.

**Plan.**
- Build an in-memory **search index** in the renderer (rebuild on settings/
  tree change):
  - Projects (`settings.projects[*].name + path`)
  - Features (`settings.projects[*].features[*]`)
  - Open panes (title, cwd)
  - Bookmarks (`settings.bookmarks`)
  - Notebook tree (recursive)
  - Plan files (from the same `plans:forBranch` cache)
- Use a simple `fzy`-style scorer (a tiny inline scorer; avoid a dep).
  Group results by source with a header (Project / Feature / Pane / …).
- Picker UI: reuse the modal-overlay + virtualized list style of
  `pickers.ts` (`showCommandPalette` is the closest precedent).
- On select, dispatch:
  - Project → `paneActions.splitWithProject` (split) or focus existing pane
    in that cwd.
  - Feature → open feature detail modal (or jump to the project's Features
    sub-tab).
  - Pane → `selectPane(id)`.
  - Bookmark → `openLink(content)`.
  - Notebook doc → `openNote(path)`.
  - Plan file → `openMarkdownFile(absPath)`.
- Binding lives in `keybindings.ts` with scope `'global'` only (so it
  doesn't collide inside modals — see item 15).

**Files touched.** `src/renderer/src/keybindings.ts`,
`src/renderer/src/pickers.ts` (new `showGlobalSearch()`),
`src/renderer/src/commands.ts` (a few dispatcher helpers),
`src/renderer/src/main.ts` (wire action).

**Acceptance.** Pressing Cmd+J anywhere opens a unified picker; typing
"craft" shows the Crafterm project, the Crafterm feature list entries, and
any open Crafterm pane(s); Enter on a feature row opens the feature; arrow
keys + Enter cycle by group.

---

## Cross-cutting notes

- **Reminder type extension** (items 5, 8, 14) is a shared dependency.
  Implement once in item 5; later items consume the same shape.
- **Shared remind-me picker** (items 8, 14) is extracted from `bookmarks.ts`
  in item 8; item 14 only adds the trigger.
- **Active-scope keybindings** (item 15) is a prerequisite for clean keybind
  additions in items 10 and 20 — implement 15 before adding the new
  shortcuts if possible. Otherwise add the shortcut and refactor scope-aware
  dispatch in 15.
- **safeStorage vs keytar** (items 18, 19) — try `safeStorage` first (no new
  dep). Only ask user to add `keytar` if safeStorage proves insufficient.
- **No new test framework** — verification per CLAUDE.md is typecheck +
  build + manual `npm run dev` smoke. Each item lists its acceptance
  criteria; we'll exercise them in the running app.

## Workflow per item

1. Mark item In progress in `~/.crafterm/todo-list.json`.
2. Apply the diff scoped to the files listed under that item.
3. `npx tsc --noEmit -p tsconfig.web.json && npx tsc --noEmit -p tsconfig.node.json`.
4. `npm run build`.
5. `npm run dev` and verify acceptance manually.
6. Flip item to **Ready to test** in the JSON.
7. Stop. Await user "ok next" before starting the next item.
