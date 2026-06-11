# Crafterm — Backlog #4–#18 Implementation Plan

## Context

The user wants the 15 backlog items that come **after** todo33 (the Docker modal)
implemented one-by-one, easiest→hardest, each moved to **Ready to test** in
`~/.crafterm/todo-list.json`. Research found that **todo115 is already fully
built** (`filePane.ts` + explorer integration), and the daily-plan, bookmarks,
PR/diff and reminder subsystems already exist — so most items extend existing
code rather than create new subsystems.

Branch: `improve-crafterm`. No test framework exists; verification = `npx tsc
--noEmit` on both tsconfigs + `npm run build` + `npm run dev` manual exercise.

### Decisions locked with the user
- **todo140**: `Cmd+Shift+R` becomes context-sensitive — terminal/pane focused → open New Reminder; left sidebar focused → existing rename.
- **todo48**: detect Claude state by **reading the session JSONL** (reuse the existing `claudeSessionTitle` jsonl path).
- **todo126**: markdown selection sends a **`file.md:line-line` reference** (same style as diff/file pane).
- **todo153**: new plan file auto-opens as a **new markdown tab in the same group**; that pane is auto-treated as **plan mode** (Clarify shows in the action menu) while the plan doc is open.
- **todo131**: scan **every sidebar project node's path** for `<path>/docs/plans`.
- **todo149**: default **icon-only** tabs, hover tooltip = title + shortcut; settings switch (icon/text/both) + per-tab enable/disable.
- **todo147**: reminder type (normal/bookmark/link/daily task) **auto dual-creates** the linked record and links via `payload`.
- **todo88**: clicking an app in the pane action menu **asks Split / New tab** each time (run-command modal style).

---

## Implementation order (easy → hard)

### 1. todo150 — Right-panel tabs stretch like left sidebar
- **File:** `style.css` (`.notif-tabs` / `.notif-tab` ~3537–3558).
- Add `flex: 1` to `.notif-tab` and remove fixed horizontal padding so tabs spread to full width (mirrors `#sidebar-tabs button { flex: 1 }` at ~456). Pure CSS.

### 2. todo129 — Markdown/file pane: Show in Finder + copy full path
- **Files:** `pane.ts` (`createDocPane` header ~651–679), `filePane.ts` (header ~47–69).
- Add two header buttons next to reload/close:
  - **Reveal**: `window.crafterm.revealPath(absPath)` → existing main IPC `shell:revealPath` (index.ts:1663). Confirm/add preload method `revealPath` if missing.
  - **Copy path**: copies the file's full absolute path via `navigator.clipboard.writeText` (renderer-safe). Brief "Copied" affordance via title text swap.
- The filename span already exists; just wire the copy to it / a small button.

### 3. todo141 — Configurable reminder default hour + quick presets
- **Files:** `reminders.ts` (`quickPresets` ~51–69, default time ~263), `settings.ts`, `state.ts`, `preload/api.d.ts`.
- New persisted setting `settings.reminderDefaults = { defaultHour: number /*11*/, quickPresets: { label, offsetMin?, atHour? }[] }`.
- `quickPresets()` builds from settings; "Tomorrow HH:00" uses `defaultHour`. New-reminder default time uses `defaultHour` for day-based, keeps +1h for same-day.
- Settings modal: a "Reminders" subsection — number input for default hour + editable preset list (add/remove, label + offset/hour).
- **Persistence:** four-edits-in-lockstep (field on `settings`, `persist()`, `loadSettings()` guard, `SavedState`).

### 4. todo140 — `Cmd+Shift+R` context-sensitive (reminder vs rename)
- **Files:** `keybindings.ts` (`rename` binding ~31), `main.ts` (handler map ~245), `reminders.ts` (`openReminderForm`).
- Keep the single `rename` binding on `cmd+shift+r`; change its handler to branch on focus: if the active element is inside the left sidebar (sidebar has selection/focus) → run existing rename; otherwise (a terminal/pane is the working focus) → `openReminderForm()`.
- Determine focus via `document.activeElement` containment in `#sidebar` (or existing sidebar-focus state). Relabel the binding in the keybindings list to reflect dual purpose.

### 5. todo88 — Apps listed in pane action menu (Split / New tab)
- **Files:** `pane.ts` (`buildPaneMenu` ~392–517), `commands.ts` (`runApplications` / app launch).
- Add an **"Apps — <project>"** section listing each `Application` (not just its run-commands) for projects matching the pane's cwd/projectId.
- Clicking an app opens a small Split / New tab chooser (reuse the run-command modal pattern), then launches via the existing app-launch flow honoring `app.opensAs` + environment command.

### 6. todo143 — Daily plan as a right-panel tab
- **Files:** `index.html` (right tab strip ~126–133 + a `#notif-daily-view`), `notifications.ts` (`RightTab` union, `views`/`tabs` maps, `switchTab` ~617–672), `dailyPlan.ts`.
- Refactor `dailyPlan.ts` render so its header+board (`renderHeader`/`renderBoard`) can render into a panel container, not only the modal. Add `renderDailyPanel(host)` reusing `renderBoard`.
- Add `daily` tab wired like the others; keep the modal entry too.

### 7. todo144 — Daily plan date-range filter (Today / Last 3 / Last 7 days)
- **File:** `dailyPlan.ts` (`tasksFor` ~59, board render ~194).
- Add a range selector in the panel/modal header; `tasksFor` accepts a range and filters by `date >= cutoff`. Board groups remain the 3 status columns.

### 8. todo145 — "Remind" button on daily tasks (card + task form)
- **Files:** `dailyPlan.ts` (`renderCard` ~239, `showTaskForm` ~379), reuse `reminders.ts` `openReminderForm`/quick options and bookmarks' `showRemindPicker` pattern (`bookmarks.ts:139`).
- Add a Remind action on each card and inside the task form; picking a time creates a reminder with `payload: { kind: 'dailyTask', taskId }`. When it fires it appears in the right panel; clicking the notification opens the daily modal focused on that task (extend `showDailyPlanModal(initialDate, focusTaskId?)`).

### 9. todo147 — Reminder type selector with auto dual-create
- **Files:** `reminders.ts` (`openReminderForm`), `types.ts` (`Reminder.type` + payload kinds), `bookmarks.ts`, `dailyPlan.ts`.
- Add a Type dropdown: `normal | bookmark | link | dailyTask`.
- On save: `bookmark`/`link` → also create a `Bookmark` (type link/text) and link via `payload`; `dailyTask` → also create a `DailyPlanTask` and link via `payload`. `normal` unchanged. Existing `payload` field already supports this linkage.

### 10. todo131 — Cross-project Plans section under Notebook
- **Files:** `notebook.ts`, new main IPC in `src/main/index.ts`, `preload/index.ts` + `api.d.ts`.
- New main handler `plans:scan` that takes an array of project paths (from sidebar project nodes), scans each `<path>/docs/plans`, returns `{ project, name, path, mtime }[]` (skip missing dirs).
- Add a "Plans" section in the notebook view: searchable flat list grouped by project; click opens the md (`openMarkdownFile`); a **Remind** action per row reuses the reminder picker → `payload: { kind:'plan', path }`.

### 11. todo126 — Markdown selection → add `file:line` ref to chat
- **Files:** `pane.ts` (`createDocPane` preview rendering), reuse `filePane.ts`'s ref pattern + `window.crafterm.input`.
- In the rendered markdown preview, on text selection show a floating "+" (like diff/file pane). Map the DOM selection back to source line numbers (the markdown renderer must emit `data-mdline` markers on block elements; compute line range from the selected blocks). Emit `relativePath:line-line` to the resolved target terminal via `window.crafterm.input`.
- Requires `markdown.ts` to annotate rendered blocks with source line numbers.

### 12. todo153 — Auto-open new plan as a tab + plan mode + Clarify
- **Files:** `commands.ts`, `pane.ts`, `content.ts`, main `plans:forBranch`/`onPlansChanged` (index.ts ~1101), `types.ts`.
- Subscribe to `onPlansChanged`; when a **new** plan file owned by a pane (`--pane-<id>` suffix) appears, open it as a new markdown **tab in that pane's group** via `openMarkdownFile`/`createDocPane` placed as a tab.
- Mark that doc pane as "plan mode" (a transient flag while the plan doc is open). When a pane is in plan mode, its action menu shows a **Clarify** item that writes the clarify-skill invocation (e.g. `/run-clarify`) into the originating Claude terminal via `window.crafterm.input`.

### 13. todo149 — Icon-only tabs + settings (display mode, per-tab enable/disable)
- **Files:** `index.html` (both tab strips), `notifications.ts` + `sidebar.ts` (tab render), `settings.ts`, `state.ts`, `api.d.ts`, `style.css`.
- New persisted `settings.tabDisplay = { mode: 'icon'|'text'|'both', hidden: { left: string[], right: string[] } }` (default `icon`).
- Give each tab an inline SVG icon constant + a `title="<label> · <shortcut>"` for the hover tooltip. CSS renders icon/text/both per `mode`.
- Settings: a "Tabs" section — mode selector + checkboxes to enable/disable individual left & right tabs (hidden tabs not rendered).
- Four-edits-in-lockstep persistence.

### 14. todo48 — Claude status in the left sidebar (in-progress / question / idle)
- **Files:** new main IPC `claude:sessionStatus` (reuse jsonl reader near `claudeSessionTitle`), `preload`, `pane.ts` (poll while `pane.claude`), `sidebar.ts` (status dot ~518–575), `types.ts`, `style.css`.
- Main reads the pane's session `.jsonl`; derive state from the last entry: assistant message still streaming / last role = pending tool result → **in-progress**; an assistant turn ending in a question / `tool_use` awaiting permission → **question/waiting**; otherwise settled → **idle/waiting-you**. Return `{ state }`.
- `pane.ts` polls `claude:sessionStatus` for Claude panes (lightweight interval, only while `pane.claude`), stores `pane.claudeStatus`.
- `sidebar.ts` renders a Claude-specific badge/dot variant next to the pane row (extend existing `status-dot` in `buildLeading`/`buildBelow`), distinct classes (`claude-inprogress` / `claude-question` / `claude-idle`) styled in `style.css`.

### todo115 — Files panel → send `file:line` to terminal — **ALREADY DONE**
- `filePane.ts` (`send`/`currentRef`) + `explorer.ts` `openFile`→`openFileViewer` already implement this exactly. **Action: verify in-app, then move to Ready to test** (no code).

---

## Cross-cutting notes
- **Persistence pattern** (todo141, todo149, new fields): edit in lockstep — field on `settings` (`state.ts`), `persist()` payload, `loadSettings()` guarded restore, and `SavedState` in `preload/api.d.ts`; migrate old shapes on read.
- **New IPC pattern** (todo131, todo48): handler in `src/main/index.ts` → method in `preload/index.ts` → signature in `preload/api.d.ts`.
- English-only in all code; no Turkish strings/comments. Conventional Commits, branch only (no commits unless asked).

## Verification (per item)
1. `npx tsc --noEmit -p tsconfig.web.json` and `-p tsconfig.node.json` — must pass.
2. `npm run build` — must succeed.
3. `npm run dev` — exercise each feature manually.
4. After each item verified, move its entry in `~/.crafterm/todo-list.json` from Backlog → Ready to test.
