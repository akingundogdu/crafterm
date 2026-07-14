# Crafterm — Complete Feature Reference

The **exhaustive inventory of every feature and behavior** in Crafterm. Each entry is an
*action → expected result* pair, so this doubles as the behavior contract: a change that
breaks a **Verify** line here is a regression.

- **Stack:** Electron 33 + xterm.js + node-pty + **Monaco** (SQL + code editor) +
  better-sqlite3/pg/mysql2. TypeScript throughout; the renderer is **gea** `.tsx`
  components (no React).
- This document describes **behavior only** — it names no source files or line numbers, so
  it stays true as the code moves. For how the code is organised, read
  [`views-architecture.md`](views-architecture.md) and `CLAUDE.md`.

---

## 1. Architecture Overview

```
   RENDERER (Chromium)                MAIN (Node.js)              OS
   ┌───────────────────────┐      ┌──────────────────┐
   │ xterm.js / Monaco     │      │ node-pty         │
   │  keypress  ───────────┼─IPC─>│ pty.write() ─────┼──> zsh
   │  screen    <──────────┼─IPC──┤ pty.onData() <───┼─── zsh output
   └───────────────────────┘      └──────────────────┘
```

Three process-level layers:

- **Renderer / view** — the UI. Never touches Node or Electron directly; every OS-backed
  call goes through a typed service client.
- **IPC / services** — one domain per folder (pty, git, claude, db, docker, pr, fs, …),
  each with a main-side handler, a renderer-side client, and shared types, all registered in
  a single typed channel registry, so a channel or payload drift fails at compile time.
- **Main / model** — everything that touches the OS: node-pty, the filesystem, the
  `git` / `gh` / `docker` CLIs, windows, native notifications.

- The renderer never touches the shell — it renders. Main spawns `zsh` via node-pty and
  pipes bytes over IPC. A context-isolated preload bridge (`window.crafterm`) is the only
  crossing point, and only the service clients call it.
- A terminal session's screen is a **split tree** (`LayoutNode`); the sidebar is a separate
  **folder tree** of sessions/folders/projects/worktrees, persisted across restarts.

---

## 2. Terminal & Panes

### Terminal lifecycle & xterm
- **xterm instantiation** — Terminal per pane (cursorBlink, allowProposedApi, theme). **Verify:** new pane → terminal renders, cursor blinks.
- **FitAddon mount** — auto-fit to container; `xterm.open()` mounts. **Verify:** resize pane → terminal reformats.
- **ResizeObserver → PTY resize** — fit + push cols/rows via `crafterm.resize()`. **Verify:** drag resizer → SIGWINCH fires.
- **Disposal on close** — clears observer, disposes xterm, removes from maps. **Verify:** close pane → PTY cleaned up.
- **Resize no-op guard** — skip SIGWINCH when cols/rows unchanged. **Verify:** tab switch → no TUI repaint flicker.

### PTY input & output
- **Input flow** — keyboard/clipboard → `crafterm.input(paneId,data)`. **Verify:** type/paste → lands in PTY.
- **Shift/Alt+Enter line break** — wraps CR in bracketed paste for TUI editors. **Verify:** Shift+Enter in Claude → newline, not submit.
- **Command buffer tracking** — accumulates typed chars and records the line on Enter. **Verify:** `echo hello`↵ → in command history.
- **Ctrl-C/Ctrl-U clears buffer** — 0x03/0x15 reset partial command. **Verify:** partial+Ctrl-C → not recorded.
- **Output streaming** — main writes PTY output → `xterm.write()`. **Verify:** run command → output realtime.

### Activity detection & idle notification
- **lastActivity timestamp** — updated on keystroke + output. **Verify:** typing resets idle timer.
- **Busy/idle state machine** — Enter sets busy; 700ms quiet fires idle check. **Verify:** `sleep 5` → notify ~700ms after output stops.
- **Long-run threshold 3s** — ignore sub-3s runs. **Verify:** `echo hi` → no notify; `sleep 3` → notify.
- **Idle notification** — a 'done' / 'question' event → OS notification + sound + alert card. **Verify:** unfocus + long cmd → native notification + sound.
- **Notify throttle 2s** — skip if lastNotify within 2s. **Verify:** two quick long cmds → one notification.
- **Unattended check** — notify only if window blurred or other pane active. **Verify:** focused on active pane → no notify.

### Claude awareness
- **Claude command detection** — word-level "claude" match flips `pane.claude`. **Verify:** `claude`↵ → detected; `echo claude` → not.
- **claudeSpawnedAt baseline** — filters session ids after spawn. **Verify:** two Claude panes same cwd → each resumes own session.
- **Session id locking** — freeze captured id vs newest-jsonl. **Verify:** restore → resumes exact session.
- **Status polling** — in-progress/question/idle from JSONL + outputTail. **Verify:** Claude working → sidebar dot reflects state.
- **Question heuristic** — regex on outputTail (yes/no, ❯, confirm?). **Verify:** Claude asks → amber "waiting"; finishes → green "done".
- **outputTail buffer** — ~1500 chars, Claude panes only. **Verify:** long session → only tail scanned.
- **Claude title sync (/rename)** — reads custom title from JSONL, retried 1s/3s. **Verify:** `/rename X` → sidebar label updates without restart.

### Status bar
- **Bottom status segment** — tracking·branch·worktree·cwd + copy-path. **Verify:** git repo → branch+worktree; copy → full path.
- **Branch checkout picker** — click branch → searchable modal. **Verify:** click branch → picker → checkout.
- **CWD ~ abbreviation** — home replaced with `~`. **Verify:** home dir → `~`.
- **Visibility toggle** — hidden when no segments. **Verify:** outside repo → hidden; cd into repo → appears.

### Pane header & menu
- **Header layout** — title, daily-task chip, ⋯ menu, × close. **Verify:** new terminal → header controls present.
- **Daily-task chip** — issue key (CRF-12) when assigned; click → detail. **Verify:** assign task → chip; click → modal.
- **⋯ pane menu** — split / git / project+app commands / SSH / bg color / pop-out. **Verify:** click ⋯ → context-aware actions.
- **Git quick-actions** — pull / commit+push / +PR / new branch+PR / stash(es) in a fresh split. **Verify:** "Pull" → split runs `git pull`.
- **Project/app command sections** — "Commands — <project/app>" when tied or cwd matches. **Verify:** terminal in project → section appears.
- **SSH menu items** — type ssh command into PTY. **Verify:** add SSH → menu item types command.
- **Background color swatches** — 8 colors + default. **Verify:** pick swatch → pane bg changes.

### Per-pane appearance
- **Theme application** — global theme + per-pane bg override. **Verify:** change theme → all panes update.
- **Per-pane bg override** — `pane.bgColor`, persisted. **Verify:** set bg → restored on restart.
- **Per-pane font size** — Cmd+/- on active pane only; Cmd+0 reset. **Verify:** Cmd++ → only active pane zooms.
- **Title lock** — manual /rename not clobbered by OSC. **Verify:** double-click rename → sticks.

### Links & navigation
- **Link detection** — http(s) + configured file extensions become xterm links. **Verify:** echo URL/path → clickable.
- **Cmd+click follow** — metaKey routes to `openLink`. **Verify:** Cmd+click URL → opens; plain click → no-op.

### Pane drag-to-rearrange
- **Drag handle (grip)** — pointer events, not HTML5 DnD (xterm-safe). **Verify:** drag grip → drop zones highlight.
- **Drop-zone detection** — nearest edge L/R/T/B. **Verify:** drag near edge → that edge highlights.
- **movePane** — restructures layout. **Verify:** drop → pane reorders.
- **5px drag threshold** — prevents accidental drags. **Verify:** click-without-move → no drag.

### Browser pane (webview)
- **Creation** — isolated `<webview>` + reload/external/title. **Verify:** open URL → browser pane with controls.
- **Reload / external / title-sync / close** — **Verify:** reload reloads; ↗ opens system browser; nav updates header.

### Doc pane (markdown)
- **Creation + render + edit toggle** — preview/textarea, Cmd+S saves (stays in edit). **Verify:** open note → renders; Edit → textarea; Cmd+S → saved.
- **External reload / notebook vs absolute IPC** — **Verify:** edit notebook → ~/.crafterm/notebooks; external md → disk.
- **Floating selection (Copy / Add to Chat)** — builds @path:start-end mention. **Verify:** select text → "Add to Chat" → @mention into Claude pane.
- **Copy path / reveal in Finder** — **Verify:** buttons copy path / open Finder.

### PR diff pane
- **Creation (gh pr diff)** — read-only unified diff, per-file. **Verify:** open PR diff → file list + content.
- **File nav prev/next + search** — Cmd+←/→, searchable dropdown. **Verify:** › next file; search "package" → jump.
- **Line selection** — click/drag/shift-click range. **Verify:** select 10-15 → highlighted.
- **Send reference** — paste `path:a-b` into target terminal; warn if none. **Verify:** + → reference pasted.
- **Inline PR comment** — textarea popover → GitHub API. **Verify:** comment → posts to PR.
- **Font zoom + reload** — Cmd+/- ; ⟳ re-fetch. **Verify:** zoom works; reload re-fetches.

### File viewer pane
- **Creation + line gutter + selection reference** — `relPath:line` rel to terminal cwd. **Verify:** open file → numbered; select → relative reference.
- **Send / reload / copy / reveal / font zoom** — **Verify:** all controls behave like diff pane.

### Code editor pane (Monaco)
- **Creation + single-pane reuse** — `openFile(path,line?)` reuses pane. **Verify:** click file → editor; click another → reuses.
- **Syntax highlight by extension** — Monaco TextMate. **Verify:**.ts → TS colors.
- **Theme picker (global)** — built-ins + monaco-themes catalog, persisted. **Verify:** change theme → all editors update + persists.
- **Dirty state + Cmd+S save** — red dot; writeText; ✓/⚠ feedback. **Verify:** edit → dot; Cmd+S → saved.
- **Floating selection (Copy / Add to Chat ⌘L)** — @path:start-end. **Verify:** select → Add to Chat → into Claude pane.
- **Go-to-line Cmd+G** — **Verify:** Cmd+G 50 → jumps to line 50.
- **Import resolution Cmd+click** — resolves././ imports via IPC → open file+line. **Verify:** Cmd+click import → opens target.
- **Semantic-error suppression** — single-file editing, no cross-file squiggles. **Verify:** no red for missing modules.
- **Font zoom Cmd+/-** — per-pane 8-28px. **Verify:** zoom works.

### Monaco setup & theming
- **Worker registration** — TS/JSON/CSS/HTML workers via Vite `?worker`. **Verify:**.ts IntelliSense;.json validation.
- **Built-in + external themes** — PALETTES + monaco-themes lazy-loaded. **Verify:** picker lists built-ins + 100+ VSCode themes.
- **CSS-var color resolution** — editor colors from `var(--x)`. **Verify:** change theme var → editor updates.

### Pop-out windows
- **Bootstrap (?id=paneId) + adoptPane** — output routed to pop-out. **Verify:** pop out → output streams to window.
- **Pop-out terminal + Shift+Enter + close confirm** — **Verify:** type works; running cmd → confirm on close.
- **Main-window placeholder + focus** — **Verify:** pop out → placeholder; "Focus window" → foregrounds.

### Side-by-side terminal view
- **Marking terminals** — Cmd+click a terminal row in the sidebar *marks* it (accent stripe) instead of switching to it. View-only, never persisted. **Verify:** Cmd+click two terminals → both rows get the stripe, neither is opened.
- **Tiling marked terminals** — right-click a marked terminal → "View N terminals side by side" + "Clear selection" (both appear only when >1 is marked). Tiles them in one equal-width flex row; no cap on count; a split tab contributes only its **first** pane. Pane elements are *borrowed* from their tab containers, so terminals keep running and the sidebar/tab layouts are untouched. A top strip reads "N terminals side by side" with **Exit**. **Verify:** mark two → tile → both stream output; click any terminal in the sidebar → view exits and that terminal opens normally.

### Agent composer (start screen)
- **When it shows** — no tab is auto-selected on launch; the composer fills the content area whenever no tab is active (fresh launch, all tabs closed) or on **Cmd+Shift+N** ("Show start screen" — it takes the binding "New folder" used to have). **Verify:** close every tab → composer appears.
- **Fields** — project dropdown, base-branch dropdown (project's local branches, `main` preferred; disabled when git fails), **Local / Worktree** run-mode, prompt textarea, **Build / Plan** toggle (Plan starts Claude with `--permission-mode plan`). **Cmd+Enter submits; Enter is a plain newline.** Draft text survives dropdown changes. **Verify:** each control persists its value across a re-render.
- **Slash menu** — typing `/` opens `/plan` `/build` `/local` `/worktree` plus every sidebar project with a path; contains-first ranking (exact > prefix > mid-word), arrows + Enter/Tab to pick, Esc closes. **Verify:** type `/` → menu; type a project name → it ranks to the top.
- **Submit** — files a Daily Plan ticket for today (status *todo*, medium priority) in the selected project and opens a Claude terminal on it seeded with `ultrathink <ISSUE-KEY> <title>` — inside a worktree branched off the chosen base and named after the issue key, or in the project itself. Refuses via dialog if no project is selected or the project has no issue-key prefix. **Verify:** pick a project with an issue-key prefix + Worktree + Cmd+Enter → ticket on the board, Claude terminal in a new worktree.

### Split layout & content
- **LayoutNode tree (leaf|split)** — recursive nesting. **Verify:** nested splits nest correctly.
- **Layout signature no-op guard** — skip rebuild if unchanged. **Verify:** no-op resize → no rebuild.
- **Tab-scoped containers** — flip display, never detach panes. **Verify:** switch tabs → scroll positions preserved.
- **Flex split + resizer drag (overlay over webview)** — **Verify:** drag over browser pane → drag continues.
- **Pane highlight** — `.active` on activePaneId. **Verify:** click pane → border moves.

### Plans & plan mode (per pane)
- **Plan discovery + ownership** — `--pane-<stableId>` or `-<sessionId>` match. **Verify:** tagged plan → auto-attached to pane.
- **Auto-expand details + plan mode + Clarify** — **Verify:** owned plan appears → details expand; plan mode → "Clarify" action.

### CRAFTERM_PANE_ID & stable id
- **Env injection** — stableId exposed as `CRAFTERM_PANE_ID`. **Verify:** `echo $CRAFTERM_PANE_ID` → UUID.
- **Stable id persists** — restore reuses same UUID. **Verify:** restart → same id.

### Background-process panes
- **isProcessView (view ≠ kill)** — transient view onto a `BackgroundProcess`; closing keeps PTY alive. **Verify:** view → close → process keeps running.
- **Buffer replay** — seeds xterm with pre-view output. **Verify:** open later → see accumulated output.
- **start/runAndWait/kill/onExit/collect** — **Verify:** start hidden; finish → done; kill → row gone.

### Pane status & persistence
- **Unified NodeStatus + syncPaneStatus** — idle/running/waiting/archived; never overwrites archived. **Verify:** running/waiting/archived transitions hold.
- **refreshPaneInfo (lsof cwd/branch/worktree/lastCommand)** — never null-overwrites; persists cwd. **Verify:** `cd` → status bar updates; restart → reopens there.
- **Double-click rename + commit lock** — **Verify:** double-click → rename → persists.

---

## 3. Sidebar & Tree

### Modes & search
- **Five modes (Terminal/Notebook/Database/Docker/Accounts)** — tab strip switches content. **Verify:** click each → content + placeholder change.
- **Shared search** — filters current mode; ArrowDown focuses list, Esc clears. **Verify:** type → filtered; Esc → clears.

### Layout
- **Collapse (Cmd+B)** — **Verify:** Cmd+B toggles.
- **Orientation left/top + size (120-600) + font (9-22) + Cmd+0** — **Verify:** settings reposition; drag resizes; Cmd+/- font.

### Rows & details
- **Node types (Tab/Folder/Project/Worktree)** — **Verify:** each renders with its icon/behavior.
- **Tab label + issue-key suffix** — "(CRF-12)" when pane assigned. **Verify:** assign task → suffix appears.
- **Detail chevron + status/git/panes lines + panes/plans sub-lists** — **Verify:** enable settings → details show; expand → sub-rows; click → focus/open.
- **Claude status pill (working/ask/idle) + review/test override** — **Verify:** Claude state → pill; task review → "review" badge.
- **Child-count + pin badges + color tags + active class** — **Verify:** badges/colors render; active highlighted.

### Pinned, grouping, recency
- **Pinned section + breadcrumbs** — **Verify:** pin → moves to Pinned w/ crumb.
- **Group headers / ungrouped / set-group / drag-to-group** — **Verify:** set group → bucketed under header.
- **Group by recency (Today/Yesterday/Earlier)** — **Verify:** enable → buckets by activity.

### Keyboard, rename, DnD, context menu
- **Arrow nav + Enter + Cmd+1..9** — **Verify:** arrows move; Enter activates/toggles; Cmd+N jumps.
- **Inline rename (dblclick/Cmd+Shift+R, Enter/Esc)** — **Verify:** rename commits/cancels.
- **Drag reorder / nest / to-root / drop hints** — **Verify:** drag → reorders/nests with hints.
- **Context menu (per node type) + folder settings + show archived + color** — **Verify:** right-click → type-specific actions.

### Worktree management
- **Auto-reconcile (git worktree list) + container auto-create** — **Verify:** external worktree → appears ~periodically.
- **Archive on git delete / unarchive on recreate** — **Verify:** delete → archived; recreate → active.
- **New/Remove worktree modals (hidden bg process)** — **Verify:** new → spinner → node; delete → strikethrough → archived.

### Background processes & iOS in sidebar
- **Process sub-rows + status dots + stop (×) + click-to-view + collapse-hide** — **Verify:** iOS build → sub-row; × kills; click → view.
- **iOS status dot + ▶ play + ⋯ Build&Run cascade (sim/device→targets→schemes) + Status/Clean/Stop + refresh cache** — **Verify:** ⋯ → cascading iOS menu; ▶ re-runs last target.
- **Simulators submenu** — *Shutdown all* (`simctl shutdown all`) · *Erase all…* (confirm; shutdown-then-erase) · per-simulator *Shutdown* / *Erase…* (confirm) / *Remove `<bundleId>`* (`simctl uninstall`) · Refresh. **Verify:** Simulators → Shutdown all → booted sims quit + a "done" iOS alert appears.
- **Remove app from device** — lists connected devices ("No device connected" when none) and uninstalls the worktree's app via `devicectl device uninstall app`. Uninstall entries are disabled and read "Remove app (run Status first)" until a Status report has revealed the worktree variant's bundle id. **Verify:** without a prior Status run → the disabled row shows.
- **Background execution + reporting** — every simctl/devicectl command runs in the background (120s timeout) and reports through an **iOS** notification: success as "… — done.", failure with `xcrun`'s own stderr. **Verify:** trigger a failing action → the alert carries the real stderr.

### Sidebar misc
- **Project defaults (startup/env/shell)** — **Verify:** set → new terminals inherit.
- **Project features (apps/features/runCommands/supportWorktree/iosApp/issueKeyPrefix)** — **Verify:** each surfaces in menus/sidebar.
- **Archived model (never delete, dormantRoot, show archived)** — **Verify:** close → archived; restore → layout rebuilt.
- **Tab strips (display modes, hide, reorder, persist)** — **Verify:** icon/text/both; hide; drag reorder persists.
- **Toggle-all-folders + dynamic status/active updates + MAX_FOLDER_DEPTH=4** — **Verify:** toggle all; status updates flicker-free; 4-level nesting.

---

## 4. Pickers, Spotlight, Commands, Keybindings, Dialogs

### Keybindings (customizable — Settings → Shortcuts, Cmd required)
- New terminal **Cmd+T** · New Claude **Cmd+Shift+T** · Project picker **Cmd+O** · Terminal switcher **Cmd+Shift+O** · Folder picker **Cmd+Alt+P** · Command palette **Cmd+Shift+P** · Focus search **Cmd+Shift+F** · Toggle sidebar **Cmd+B** · Show start screen **Cmd+Shift+N** (New folder ships unbound) · Split right **Cmd+D** · Split+Claude **Cmd+Shift+D** · Split+project **Cmd+Alt+T** · Global search **Cmd+J** · Spotlight **Cmd+P** · Next/Prev pane **Cmd+]**/**Cmd+[** · Distribute **Cmd+Shift+E** · Settings **Cmd+,** · Improve **Cmd+Shift+L** · Daily plan **Cmd+Shift+K** · Rename/New reminder **Cmd+Shift+R**. **Verify:** each fires its action; rebinds persist.
- **Spotlight per-tab shortcuts** (Files/Commands/Claude/Terminals/Shortcuts/Plans/Bookmarks/Apps/Tasks/Projects/Notebooks/Accounts — default unbound). **Verify:** bind → jumps to that tab.
- **Fixed:** Cmd+W close pane · Cmd+1.9 tab jump · Cmd+Alt+Arrow focus pane · Cmd+=/-/0 zoom (context-routed).,§14. **Verify:** each behaves.

### Dialogs
- **makeCloseButton / promptText / promptConfirm / promptSelect (+New…) / promptForm** — **Verify:** Enter resolves, Esc cancels; select "+New" → text prompt.
- **Close-actions modal (mark done / remove worktree toggles, both ON)** — **Verify:** Cmd+W on task/worktree pane → toggles → apply.

### Pickers
- **Plans · Worktree dashboard · Background processes · Running devices · SSH manager (+edit) · Claude dashboard · Project picker (Enter open / Cmd+Enter split) · Folder path picker · Markdown finder · Run applications · Run command · Run app · Feature setup · File finder · Command palette · Claude account switcher · Claude resume · Terminal switcher · Command history · Folder browser · Stash manager · Branch checkout · Global search · Update modal.** **Verify:** each opens, filters, and its primary action works.

### Spotlight
- **Cmd+P modal, 13 tabs, Tab/Shift+Tab switch, lazy-load heavy sources, Enter open, Cmd+Enter altRun.** Tabs: All/Files/Commands/Claude/Terminals/Shortcuts/Plans/Bookmarks/Apps/Tasks/Projects/Notebooks/Accounts. **Verify:** each tab populates + opens results; Files/Commands/Plans/Backlog lazy-load.

### High-level commands
- **Terminal/Claude/project creation, split (row/col/with-Claude/with-project/with-IDE), open URL/link/note/SQL/markdown/PR-diff/file-viewer/code-editor, run-in-dir/folder/split, resume Claude, close/archive (running check + close-actions), pop-out/kill, select pane/tab, cycle, equalize, doc font, focus-in-direction, rename/color/pin/collapse/move, run applications, create feature.**. **Verify:** spot-check each (shortcut or menu) → expected behavior.

### Palette seed
- **~15 git + ~14 linux default cheatsheet commands** inserted into active terminal (no auto-run). **Verify:** Cmd+Shift+P → pick → typed, not run.

### Datepicker — reusable
- **Date/datetime field + popover calendar, `.value` (YYYY-MM-DD) get/set, change event, month nav, time spinners (datetime mode).**. **Verify:** used in reminders/daily-plan/meeting-notes; pick date → button + event.

---

## 5. Settings — every option persists across restart

### Appearance / Theme
- Font family · Terminal font 6-40 · Background presets · Custom bg color · Code editor theme. **Verify:** change → effect + persists.
- Theme selector + "Copy colors → Custom" + 22-color ANSI grid (editable only when Custom). **Verify:** Custom → grid editable; builtin → disabled.

### Sidebar / Tabs
- Position left/top · Sidebar font 9-22 · Show status/git/pane-count/panes · Group by recency. **Verify:** each toggles its UI.
- Tab display mode (icon/text/both) · per-tab hide (sidebar + right panel). **Verify:** mode changes; hide removes tab.

### Workspace / Commands
- Code root · Code extensions · Todo file · Explorer root · Explorer exclude · Notification sound (preview) · Keychain service · Fallback secret. **Verify:** each drives its feature + persists.
- IDE command · Update-zsh command · Markdown folders · Command palette entries (category/name/command). **Verify:** each used by its action.

### Projects (master-detail) → General/Environment/Apps/Features/Run commands/iOS
- Ask-project-on-new · Environments · Groups · Project tree. **Verify:** edits resync sidebar.
- Per-project: Name/Path/Group/Command/Startup/Shell/IssueKeyPrefix/SupportWorktrees; Env vars; Apps (name/path/opensAs/per-env commands/run commands); Features; Run commands; iOS (enable + repo/xcode/scheme/bundle/prefix/simulator/worktrees-dir/copy-files). **Verify:** each surfaces in sidebar/menus + persists.

### Reminders / Action menu / Shortcuts / System update / Footer
- Default hour · Quick presets. **Verify:** presets drive reminder form.
- Action menu editor (add/edit/reorder/hide/delete, builtin rename, reset). **Verify:** changes reflect in sidebar ⋯ menu.
- Keybindings recorder (Cmd required) + per-shortcut reset. **Verify:** record → new combo works.
- System update: codebase path + update command. **Verify:** drives "Update Crafterm".
- Save-status chip (No changes / Saving… / Saved·HH:MM:SS) + Save-now (`persistNow`). **Verify:** change → Saving → Saved; Save now flushes.

---

## 6. Right Panel (Alerts / Reminders / Files / Time / PR / Bookmarks)

### Panel & Alerts
- **Toggle Alt+Cmd+Right + unread badge + clear-all + resizable width** — **Verify:** toggle; badge counts; clear empties; resize persists.
- **Cards: expand/collapse, accent by event (question amber / done green / reminder blue), message, source chips, project tint, click-to-select (focus pop-out), dismiss, time-ago** — **Verify:** each card behavior.
- **Remind-me snooze popover (presets)** — **Verify:** pick offset → reminder created.
- **Status-bar: bell toggle + Claude usage chip/popover + usage refresh + thresholds (50/70/80/90/100) + error states + version chip/redeploy** — **Verify:** usage popover; threshold notifications fire once per window; version highlights when source ahead.

### Alert grouping & filters
- **Grouped by terminal** — alerts from the same pane collapse into one card: newest title, an "N alerts" badge, relative time, newest message as a one-line summary. Expanding reveals the individual cards (each keeping its own remind/snooze/dismiss); the group's `×` dismisses **all** of them. An alert with no pane (Claude usage, app alerts) forms a group of one, i.e. renders as a normal card. Newest-first, tinted by project colour. **Verify:** one terminal raises three alerts → one card reading "3 alerts"; expand → three cards; `×` → all three go.
- **Filter chips** — a status row (All / Question / Done / Reminder) plus, only when >1 project has alerts, a project row (All projects + one chip per project with its count, sorted by count). The two filters combine; project counts respect the status chip; a project filter whose last alert disappears resets itself. **Verify:** click "Question" → only question alerts remain.

### Reminders
- **Create/edit form (When datetime, presets, text, type, repeat none/daily/weekly/biweekly/monthly/interval, interval min)** — **Verify:** form builds reminders; type disabled on edit.
- **List sorted + upcoming/past sections + repeat badge + edit/remind-again/delete** — **Verify:** ordering, badges, actions.
- **20s timer loop → fire (OS + card + sound), repeat re-schedule, advance missed, one-shot→past** — **Verify:** due reminder fires + reschedules.
- **Payload targets (bookmark/pane/notebook/dailyTask/plan/meetingNote) → card Open action; snooze chips** — **Verify:** fired card opens its target.

### Files / Explorer
- **Root (follows pane worktree/settings/cwd) + refresh + search (flat ≤500) + tree (lazy) + type icons + git decoration** — **Verify:** tree loads; search flattens; git colors.
- **Open (md→viewer, code→editor) + context menu (open/new-page/Finder/rename/exclude/delete) + new file/folder + exclude list** — **Verify:** each action works on disk + tree.

### Time tracking
- **Project+feature selectors + add feature + manual start/stop + elapsed display + today summary** — **Verify:** start counts up; summary aggregates.
- **Pomodoro presets (25/30/40) + custom (1-600) + repeat + finish (log+notify+sound)** — **Verify:** countdown + finish behavior.
- **Report modal (today/7/30/all, project→feature breakdown, copy) + auto-tracking (active+focused+activity, 30s tick, 5min idle) + track modal + stop + persistence** — **Verify:** report; auto-log; persists.

### Bookmarks
- **Add/edit (type link/text/code/snippet, title, content, tags) + list (badge, snippet, mono for code) + tag/type filter chips + search + open/copy/remind/edit/delete + reminder chip + empty state** — **Verify:** each behavior.

### PR tab
- **gh pr diff view + polling (start/stop with visibility)** — **Verify:** switch to PR tab → diff; polling toggles.

---

## 7. Data Tools (Database / Docker / PR & Deployments / Diff)

### Database
- **Sidebar tree (groups/connections/objects), new project/folder/connection, rename/delete, drag reorder/nest, color, search** — **Verify:** full tree CRUD.
- **Connection form (PG/MySQL/SQLite, fields, SSL, file path, Test, Save, Edit)** — **Verify:** Test → result; Save → tree.
- **Object introspection (tables/views/procedures, lazy-load, columns PK/auto-inc/default; PG/MySQL/SQLite specific)** — **Verify:** expand → objects; edit → column meta.
- **SQL pane (Monaco, connection select, Run Cmd+Enter, error, timing, highlight, autocomplete, theme, focus)** — **Verify:** run query → grid + timing.
- **Result grid (table, sort cycle, persist sort, 1000-row cap, formatting, edit/insert/delete row modals, row-action disabled w/o PK)** — **Verify:** sort re-runs; mutations build correct SQL + re-fetch.
- **Saved queries (.sql list/save/open/delete, live reload)** — **Verify:** save → appears; open → loads.
- **Mutation SQL builders (UPDATE/INSERT/DELETE, identifier quoting, literal formatting, NULL, re-run)** — **Verify:** reserved-word table quoted; NULL toggle works.

### Docker
- **Sidebar mode + availability check + retry; tabs containers/images/volumes/networks/compose; search filter** — **Verify:** each tab lists; daemon-down → error+retry.
- **Container actions (start/stop/restart/remove, logs live, exec interactive — running only)** — **Verify:** each action.
- **Detail modal (inspect structured + raw JSON, logs xterm, terminal xterm; ports/mounts/networks formatted)** — **Verify:** tabs render.
- **Image/volume/network remove + inspect; prune (images/volumes/networks); container stats merged** — **Verify:** remove/prune/stats.
- **Compose start/stop/restart/down** — **Verify:** each compose action.

### PR & Deployments
- **PR panel (current vs all scope, card: number/title/branch/mergeable/review/checks/comments, draft/state color/current-branch highlight)** — **Verify:** cards reflect status.
- **PR actions (review→webview, diff→pane, merge squash+delete, create PR --web, refresh)** — **Verify:** each.
- **Polling (visible only, ~20s busy/5min settled, check-change alert)** — **Verify:** checks update; alert on transition.
- **Project picker (all scope: searchable multi-select, save, pre-checked)** — **Verify:** select repos → list scoped.
- **Deployments tab (deployment + workflow-run cards, state badges, open URL/GitHub, job/step logs, completion alert)** — **Verify:** runs/deployments render + open.

### Diff pane
- **Covered in §2 (PR diff pane)** — display, file nav/search, line colors, hunks, line numbers, reload, font zoom, selection→terminal, PR comments.

### Data-tool IPC (main)
- **db:connect/objects/columns/query/disconnect** · **dbq:list/read/write/delete** · **docker:available/containers/images/volumes/networks/compose/stats/inspect/action/prune** · **pr:available/list/repos/list-all/merge/view/diff/comment** · **gh:runs/run-jobs/deployments/deploys-all**. **Verify:** each channel returns expected shape.

---

## 8. Productivity & Content

### Daily Plan (Kanban)
- **Create/edit/delete task; drag reorder + drag between columns (status)** — **Verify:** card moves + persists.
- **Columns (backlog/todo/wip(+review/test badges)/done); date nav + range (Today / Last 3 days / Last 7 days / Last 2 weeks / Last 1 month / **All**); per-column search** — **All** ignores the selected date and shows every task (tag/project filters still apply); multi-day ranges sort by date, then order, and show the card's date. **Verify:** pick **All** → tasks from every date appear and the date arrows no longer change the list.
- **Card (title/desc/priority dot/issue-key or worktree chip/review-test badge/due-date label/tags); actions (▶ Claude / ⏰ remind / ✎ edit / × delete)** — **Verify:** all card elements + actions.
- **Status transitions; priority; date + due-date (overdue red / soon yellow); project select (required); issue-key auto from prefix; worktree slug** — **Verify:** each field.
- **Tags (multi-select, create, 10-color palette, filter OR, manage modal)** — **Verify:** create/filter/manage.
- **Compact view (Notebook sub-tab: status tabs, search, range, open-full) + Cmd+N** — **Verify:** compact board.
- **Open in Claude (seeds ultrathink+issueKey+title+desc, assigns task, →In Progress); open in worktree (creates branch+worktree, nests)** — **Verify:** terminal seeded; worktree nested.
- **Worktree creation progress overlay** — "Run in worktree" (from the board or the agent composer) shows an overlay "Preparing worktree `<branch>`" with four steps — *Looking for an existing worktree → Creating the worktree → Adding it to the sidebar → Starting the terminal* — each pending / running / done / failed. On failure it stops on the offending row, prints **git's own stderr** verbatim, keeps the overlay up until **Close**, and **leaves the ticket's status alone**. On success it closes once the Claude terminal starts. **Verify:** run a ticket on a branch that is already checked out → overlay stops on "Creating the worktree" with git's error text, and the ticket stays in its original column.
- **Mark done/review/test from pane menu (+ worktree-delete prompt); assign pane→task; view task details** — **Verify:** menu actions move task.
- **Changelog report (range, generate done-tasks markdown, copy)** — **Verify:** generates + copies.

### Meeting Notes
- **Create/edit/delete; archive/unarchive; group by project (No project last); newest-first; card (date/title/attendees/project/snippet); remind; Cmd+N; deep-link** — **Verify:** each behavior.

### Improve / Todo
- **Load todo-list.json (legacy md migration, stable ids); 3-tab layout (Todo/Ready/Done) + Cmd+1/2/3; in-progress + up-next groups; drag reorder backlog; progress bar; search; request feature (Cmd+N, Cmd+Enter save); inline edit; move (mark done/reopen/approve); clear done; detail modal; open-in-window (always-on-top, syncs json); footer path** — **Verify:** each behavior; window mode syncs.

### Notebook
- **Tree (folders/notes), create note/subfolder, rename, delete, colors, show-in-Finder, linked external files, sub-tabs (Notes/Plans/Daily/Meeting), search, remind, markdown render, active highlight** — **Verify:** each behavior.

### Accounts
- **Create account/secret, edit, delete (clears secrets); card display (account/secret); custom fields (secret flag → safeStorage); copy; reveal secret (fetch on first); tags; search; kind filter; newest-first; field builder** — **Verify:** secret values via safeStorage, not JSON.

---

## 9. Backend / Main / IPC / Persistence

### Lifecycle & windows
- **Main window (fullscreen, traffic lights, preload, webviewTag) + fullscreen broadcast + dev dock icon + reload prevention + custom menu (Cmd+W pane) + two-pass PTY-drain quit** — **Verify:** Cmd+R no-op; quit drains PTYs cleanly.
- **Pop-out window (popout.html?id, pty:adopt, close-confirm) + Improve window (singleton, always-on-top)** — **Verify:** pop-out streams; improve window floats.

### PTY / shell / background
- **pty:create (zsh, xterm-256color, cwd restore, CRAFTERM_PANE_ID, ZDOTDIR shim) + pty:input/resize/kill + pty:adopt + zsh preexec last-cmd capture** — **Verify:** terminal works; last-cmd restored.
- **proc:start/buffer/attach (hidden PTY, 256KB buffer, view-independent)** — **Verify:** hidden run + replay.

### Git / Claude
- **git:branches/stashList/fileStatus/worktrees/worktreeAdd** — **Verify:** each returns expected.
- **claude:latestSession/sessionCwd/sessionTitle/sessionStatus/permissionMode/usageSummary/realUsage/watchSessions/sessions** — **Verify:** session detection, usage, watch broadcast.

### Filesystem / notebook / plans / secrets
- **fs/dir: list, readMd/writeMd, readText/writeText, createFile, mkdir, rename, trash, resolveImport, findFiles; md:findAll** — **Verify:** each op (text cap 2MB, binary rejected).
- **notebook: tree/read/write/mkdir/create/rename/move(cycle-guard)/delete/reveal** — **Verify:** notebook CRUD under ~/.crafterm/notebooks.
- **plans: list/scan/forBranch/watched + planFilename parse (owner tags)** — **Verify:** plans matched to ownership; watch broadcasts.
- **secrets:set/get/delete/available (safeStorage)** — **Verify:** encrypted files; decrypt on get.

### App version / deploy / iOS / sound / zsh / monaco / todo
- **app:version/buildInfo/repoGit/buildCounter; deploy:build/killAllPtys/swap/wasUpdating** — **Verify:** version chip; self-update flow + loading overlay.
- **iosWorktree:scriptPath/report/stop; ios:listTargets/listSchemes** — **Verify:** report JSON; targets/schemes enumerate.
- **sound:play/event; notify (skip if focused, click→focus-pane); zsh:commands; monaco:theme; todo:read/write; backlog:read; ide:open; open-external; markdown:open; shell:revealPath** — **Verify:** each.

### Persistence
- **store:load/save (atomic temp+rename); stateDir ~/.crafterm[-dev]; SCHEMA_VERSION=4 backup-on-mismatch** — **Verify:** state round-trips; bad version backed up.
- **Layout serialization (cwd/claude/bgColor/projectId/status/role/dailyTask…); notifications 24h cap 50; debounced 300ms save + persistNow on app:quitting; loadSettings (safe typed) + action-menu auto-migrate** — **Verify:** restart restores everything; new builtins appear.
- **Test isolation** — `stateDir` honors the `CRAFTERM_STATE_DIR` env override (used by the unit/e2e harness); unset → `~/.crafterm` (dev: `~/.crafterm-dev`). **Verify:** env override → temp dir; unset → `~/.crafterm`.

---

## 10. Keyboard Shortcuts (summary table)

Customizable (Settings → Shortcuts): see §4. Fixed: Cmd+Alt+Left/Right toggle sidebar/notif panel · Cmd+Alt+Up/Down focus pane · Cmd+=/-/0 zoom (doc/sidebar/terminal by focus) · Cmd+1 Terminal / Cmd+2 Notebook (+ Cmd+1..9 row jumps) · Cmd+W close pane · Cmd+S save doc.

---

## 11. Timing Constants (behavioral fingerprints)

| Constant | Value | Purpose |
| --- | --- | --- |
| Save debounce | 300ms | persist after edits |
| Idle/busy timer | 700ms | running → idle edge |
| Long-run threshold | 3000ms | min runtime to notify finished |
| Per-pane notify debounce | 2000ms | avoid spam |
| Notification-click refocus | 80ms | window settle |
| Status-copy "✓" reset | 1100ms | copy feedback |
| Command injection delay | 350ms | login shell init |
| Claude restore delay | 500ms | before `--resume/--continue` |
| Periodic cwd/git refresh | ~4000ms | all panes |
| Reminder timer | 20000ms | due check |
| Usage cache | 30s/60s | summary / real OAuth |
| Drag threshold | 5px | pane drag |
| Resizer clamp | 0.1–0.9 | split sizes |
| Terminal font | 6–40 | per-pane zoom |
| Doc font | 10–28 | markdown |
| Sidebar font | 9–22 | sidebar |
| Sidebar size | 120–600px | resizer |
| Command history | 1000 (≤500 chars) | tracked |
| Notifications | 100 live / 50 persisted (24h) | panel |
| proc buffer | 256KB | replay |
| md:findAll | 8000 files | walk cap |
| Build-counter debounce | 300ms | per-repo |
| PR poll | 20s busy / 5min settled | PR + deployments panel |
| Time-tracking idle cutoff | 5min | auto-tracking stops |
| iOS stale-build cleanup | 15min | drops in-flight iOS builds |

---

## 12. macOS-specific Dependencies

Crafterm is macOS-only today. These are the platform couplings a port would have to abstract:

- Hardcoded paths: `/usr/sbin/lsof`, `/bin/zsh`, git/gh/docker binary probes, `~/.claude/...`, `~/.crafterm[-dev]`, `/System/Library/Sounds`.
- cwd discovery via `lsof` on PTY pid. Login `-l` / interactive `-ic` / login+interactive `-lic` shells.
- Native fullscreen, hidden-inset title bar, Notification, Finder reveal, external-URL open, safeStorage (Keychain).
- SSH + DB passwords stored plaintext by design (copy-only, never auto-typed). Monaco bundled (large); ios-worktree.sh + sounds + monaco-themes ship via `extraResources`.
