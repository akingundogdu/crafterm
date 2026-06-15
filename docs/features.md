# Crafterm — Complete Feature Reference & Verification Checklist

This document is the **exhaustive, current inventory of every feature and behavior** in
Crafterm, and the **HR-1 safety net** for the architecture refactor (see
`docs/plans/improve-crafterm-architecture-refactor-…md`). After each refactor phase, walk
the relevant section feature-by-feature: every `- [ ]` item is an *action → expected result*
that must still hold. **No behavior may change** during the refactor — this list is the
contract.

- **Stack:** Electron 33 + xterm.js + node-pty + **Monaco** (SQL + code editor; CodeMirror removed) + better-sqlite3/pg/mysql2. Vanilla TS + DOM renderer.
- **Scale (2026-06-05):** ~26.6k lines renderer (~48 `.ts`), ~4.7k main/preload, `main/index.ts` 2,619 lines / 118 IPC handlers, `style.css` 7,027 lines.
- File references use `file:line` against the current source tree; re-confirm exact lines at execution since files move during the refactor.

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
- Renderer never touches the shell — it renders. Main spawns `zsh` via node-pty and pipes bytes over IPC. Preload (`src/preload/index.ts`) is the only typed, context-isolated bridge (`window.crafterm`).
- A terminal session's screen is a **split tree** (`LayoutNode`); the sidebar is a separate **folder tree** of sessions/folders/projects/worktrees, persisted across restarts.

---

## 2. Terminal & Panes

### Terminal lifecycle & xterm
- [ ] **xterm instantiation** — Terminal per pane (cursorBlink, allowProposedApi, theme). `pane.ts:156`. **Verify:** new pane → terminal renders, cursor blinks.
- [ ] **FitAddon mount** — auto-fit to container; `xterm.open()` mounts. `pane.ts:163-164,949`. **Verify:** resize pane → terminal reformats.
- [ ] **ResizeObserver → PTY resize** — fit + push cols/rows via `crafterm.resize()`. `pane.ts:310-319`. **Verify:** drag resizer → SIGWINCH fires.
- [ ] **Disposal on close** — clears observer, disposes xterm, removes from maps. `pane.ts:963-971`. **Verify:** close pane → PTY cleaned up.
- [ ] **Resize no-op guard** — skip SIGWINCH when cols/rows unchanged. `pane.ts:133-139`. **Verify:** tab switch → no TUI repaint flicker.

### PTY input & output
- [ ] **Input flow** — keyboard/clipboard → `crafterm.input(paneId,data)`. `pane.ts:278-304`. **Verify:** type/paste → lands in PTY.
- [ ] **Shift/Alt+Enter line break** — wraps CR in bracketed paste for TUI editors. `pane.ts:261-274`,`popout.ts:34-46`. **Verify:** Shift+Enter in Claude → newline, not submit.
- [ ] **Command buffer tracking** — accumulates chars, records on CR via `recordCommand()`. `pane.ts:277-304`. **Verify:** `echo hello`↵ → in command history.
- [ ] **Ctrl-C/Ctrl-U clears buffer** — 0x03/0x15 reset partial command. `pane.ts:301`. **Verify:** partial+Ctrl-C → not recorded.
- [ ] **Output streaming** — main writes PTY output → `xterm.write()`. `popout.ts:54-58`. **Verify:** run command → output realtime.

### Activity detection & idle notification
- [ ] **lastActivity timestamp** — updated on keystroke + output. `pane.ts:280,1005`. **Verify:** typing resets idle timer.
- [ ] **Busy/idle state machine** — Enter sets busy; 700ms quiet fires idle check. `pane.ts:299,1008-1029`. **Verify:** `sleep 5` → notify ~700ms after output stops.
- [ ] **Long-run threshold 3s** — ignore sub-3s runs. `pane.ts:974`. **Verify:** `echo hi` → no notify; `sleep 3` → notify.
- [ ] **Idle notification** — `notifyPane()` 'done'/'question' → OS notify + sound + card. `pane.ts:1014-1025`. **Verify:** unfocus + long cmd → native notification + sound.
- [ ] **Notify throttle 2s** — skip if lastNotify within 2s. `pane.ts:1061`. **Verify:** two quick long cmds → one notification.
- [ ] **Unattended check** — notify only if window blurred or other pane active. `pane.ts:1060`. **Verify:** focused on active pane → no notify.

### Claude awareness
- [ ] **Claude command detection** — word-level "claude" match flips `pane.claude`. `pane.ts:67-69,288-295`. **Verify:** `claude`↵ → detected; `echo claude` → not.
- [ ] **claudeSpawnedAt baseline** — filters session ids after spawn. `pane.ts:292`. **Verify:** two Claude panes same cwd → each resumes own session.
- [ ] **Session id locking** — freeze captured id vs newest-jsonl. `pane.ts:68,1260-1272`. **Verify:** restore → resumes exact session.
- [ ] **Status polling** — in-progress/question/idle from JSONL + outputTail. `pane.ts:1188-1216`. **Verify:** Claude working → sidebar dot reflects state.
- [ ] **Question heuristic** — regex on outputTail (yes/no, ❯, confirm?). `pane.ts:979-1001`. **Verify:** Claude asks → amber "waiting"; finishes → green "done".
- [ ] **outputTail buffer** — ~1500 chars, Claude panes only. `pane.ts:99,280`. **Verify:** long session → only tail scanned.
- [ ] **Claude title sync (/rename)** — reads custom title from JSONL, retried 1s/3s. `pane.ts:1218-1233`. **Verify:** `/rename X` → sidebar label updates without restart.

### Status bar
- [ ] **Bottom status segment** — tracking·branch·worktree·cwd + copy-path. `pane.ts:42,1304-1362`. **Verify:** git repo → branch+worktree; copy → full path.
- [ ] **Branch checkout picker** — click branch → searchable modal. `pane.ts:1333-1339`. **Verify:** click branch → picker → checkout.
- [ ] **CWD ~ abbreviation** — home replaced with `~`. `pane.ts:1306`. **Verify:** home dir → `~`.
- [ ] **Visibility toggle** — hidden when no segments. `pane.ts:1317-1319`. **Verify:** outside repo → hidden; cd into repo → appears.

### Pane header & menu
- [ ] **Header layout** — title, daily-task chip, ⋯ menu, × close. `pane.ts:170-200`. **Verify:** new terminal → header controls present.
- [ ] **Daily-task chip** — issue key (CRF-12) when assigned; click → detail. `pane.ts:175-184,399-414`. **Verify:** assign task → chip; click → modal.
- [ ] **⋯ pane menu** — split / git / project+app commands / SSH / bg color / pop-out. `pane.ts:423-585`. **Verify:** click ⋯ → context-aware actions.
- [ ] **Git quick-actions** — pull / commit+push / +PR / new branch+PR / stash(es) in a fresh split. `pane.ts:475-481`. **Verify:** "Pull" → split runs `git pull`.
- [ ] **Project/app command sections** — "Commands — <project/app>" when tied or cwd matches. `pane.ts:487-549`. **Verify:** terminal in project → section appears.
- [ ] **SSH menu items** — type ssh command into PTY. `pane.ts:554-561`. **Verify:** add SSH → menu item types command.
- [ ] **Background color swatches** — 8 colors + default. `pane.ts:566-583`. **Verify:** pick swatch → pane bg changes.

### Per-pane appearance
- [ ] **Theme application** — global theme + per-pane bg override. `pane.ts:345-348`. **Verify:** change theme → all panes update.
- [ ] **Per-pane bg override** — `pane.bgColor`, persisted. `pane.ts:69,351-357`. **Verify:** set bg → restored on restart.
- [ ] **Per-pane font size** — Cmd+/- on active pane only; Cmd+0 reset. `pane.ts:70,1419-1426`. **Verify:** Cmd++ → only active pane zooms.
- [ ] **Title lock** — manual /rename not clobbered by OSC. `pane.ts:50,1096`. **Verify:** double-click rename → sticks.

### Links & navigation
- [ ] **Link detection** — http(s) + configured file extensions become xterm links. `pane.ts:360-393`. **Verify:** echo URL/path → clickable.
- [ ] **Cmd+click follow** — metaKey routes to `openLink`. `pane.ts:384-387`. **Verify:** Cmd+click URL → opens; plain click → no-op.

### Pane drag-to-rearrange
- [ ] **Drag handle (grip)** — pointer events, not HTML5 DnD (xterm-safe). `pane.ts:74-127`. **Verify:** drag grip → drop zones highlight.
- [ ] **Drop-zone detection** — nearest edge L/R/T/B. `pane.ts:104-109`. **Verify:** drag near edge → that edge highlights.
- [ ] **movePane** — restructures layout. `pane.ts:118`. **Verify:** drop → pane reorders.
- [ ] **5px drag threshold** — prevents accidental drags. `pane.ts:100`. **Verify:** click-without-move → no drag.

### Browser pane (webview)
- [ ] **Creation** — isolated `<webview>` + reload/external/title. `pane.ts:648-711`. **Verify:** open URL → browser pane with controls.
- [ ] **Reload / external / title-sync / close** — `pane.ts:696-715`. **Verify:** reload reloads; ↗ opens system browser; nav updates header.

### Doc pane (markdown)
- [ ] **Creation + render + edit toggle** — preview/textarea, Cmd+S saves (stays in edit). `pane.ts:719-940`. **Verify:** open note → renders; Edit → textarea; Cmd+S → saved.
- [ ] **External reload / notebook vs absolute IPC** — `pane.ts:784-796`. **Verify:** edit notebook → ~/.crafterm/notebooks; external md → disk.
- [ ] **Floating selection (Copy / Add to Chat)** — builds @path:start-end mention. `pane.ts:831-936`. **Verify:** select text → "Add to Chat" → @mention into Claude pane.
- [ ] **Copy path / reveal in Finder** — `pane.ts:732-751`. **Verify:** buttons copy path / open Finder.

### PR diff pane
- [ ] **Creation (gh pr diff)** — read-only unified diff, per-file. `diffPane.ts:85-529`. **Verify:** open PR diff → file list + content.
- [ ] **File nav prev/next + search** — Cmd+←/→, searchable dropdown. `diffPane.ts:426-490`. **Verify:** › next file; search "package" → jump.
- [ ] **Line selection** — click/drag/shift-click range. `diffPane.ts:330-344`. **Verify:** select 10-15 → highlighted.
- [ ] **Send reference (+)** — paste `path:a-b` into target terminal; warn if none. `diffPane.ts:198-218`. **Verify:** + → reference pasted.
- [ ] **Inline PR comment** — textarea popover → GitHub API. `diffPane.ts:220-314`. **Verify:** comment → posts to PR.
- [ ] **Font zoom + reload** — Cmd+/- ; ⟳ re-fetch. `diffPane.ts:506-524`. **Verify:** zoom works; reload re-fetches.

### File viewer pane
- [ ] **Creation + line gutter + selection reference** — `relPath:line` rel to terminal cwd. `filePane.ts:40-219`. **Verify:** open file → numbered; select → relative reference.
- [ ] **Send / reload / copy / reveal / font zoom** — `filePane.ts:128-260`. **Verify:** all controls behave like diff pane.

### Code editor pane (Monaco)
- [ ] **Creation + single-pane reuse** — `openFile(path,line?)` reuses pane. `codePane.ts:54-276`. **Verify:** click file → editor; click another → reuses.
- [ ] **Syntax highlight by extension** — Monaco TextMate. `codeEditor.ts:142-269`. **Verify:** .ts → TS colors.
- [ ] **Theme picker (global)** — built-ins + monaco-themes catalog, persisted. `codePane.ts:78-94`. **Verify:** change theme → all editors update + persists.
- [ ] **Dirty state + Cmd+S save** — red dot; writeText; ✓/⚠ feedback. `codePane.ts:178-203`,`codeEditor.ts:177`. **Verify:** edit → dot; Cmd+S → saved.
- [ ] **Floating selection (Copy / Add to Chat ⌘L)** — @path:start-end. `codeEditor.ts:180-235`. **Verify:** select → Add to Chat → into Claude pane.
- [ ] **Go-to-line Cmd+G** — `codeEditor.ts:237-242`. **Verify:** Cmd+G 50 → jumps to line 50.
- [ ] **Import resolution Cmd+click** — resolves ./ ../ imports via IPC → open file+line. `codeEditor.ts:89-123`. **Verify:** Cmd+click import → opens target.
- [ ] **Semantic-error suppression** — single-file editing, no cross-file squiggles. `codeEditor.ts:14-28`. **Verify:** no red for missing modules.
- [ ] **Font zoom Cmd+/-** — per-pane 8-28px. `codePane.ts:259-262`. **Verify:** zoom works.

### Monaco setup & theming
- [ ] **Worker registration** — TS/JSON/CSS/HTML workers via Vite `?worker`. `monacoSetup.ts:14-22`. **Verify:** .ts IntelliSense; .json validation.
- [ ] **Built-in + external themes** — PALETTES + monaco-themes lazy-loaded. `editorThemes.ts:21-82`,`monacoSetup.ts:91-132`. **Verify:** picker lists built-ins + 100+ VSCode themes.
- [ ] **CSS-var color resolution** — editor colors from `var(--x)`. `monacoSetup.ts:27-32`. **Verify:** change theme var → editor updates.

### Pop-out windows
- [ ] **Bootstrap (?id=paneId) + adoptPane** — output routed to pop-out. `popout.ts:11,51`. **Verify:** pop out → output streams to window.
- [ ] **Pop-out terminal + Shift+Enter + close confirm** — `popout.ts:22-94`. **Verify:** type works; running cmd → confirm on close.
- [ ] **Main-window placeholder + focus** — `content.ts:9-24`. **Verify:** pop out → placeholder; "Focus window" → foregrounds.

### Split layout & content
- [ ] **LayoutNode tree (leaf|split)** — recursive nesting. `types.ts:9-11`,`content.ts:26-70`. **Verify:** nested splits nest correctly.
- [ ] **Layout signature no-op guard** — skip rebuild if unchanged. `content.ts:142-145`. **Verify:** no-op resize → no rebuild.
- [ ] **Tab-scoped containers** — flip display, never detach panes. `content.ts:138-178`. **Verify:** switch tabs → scroll positions preserved.
- [ ] **Flex split + resizer drag (overlay over webview)** — `content.ts:54-125`. **Verify:** drag over browser pane → drag continues.
- [ ] **Pane highlight** — `.active` on activePaneId. `content.ts:127-131`. **Verify:** click pane → border moves.

### Plans & plan mode (per pane)
- [ ] **Plan discovery + ownership** — `--pane-<stableId>` or `-<sessionId>` match. `pane.ts:1125-1184`. **Verify:** tagged plan → auto-attached to pane.
- [ ] **Auto-expand details + plan mode + Clarify** — `pane.ts:1154-1178,440`. **Verify:** owned plan appears → details expand; plan mode → "Clarify" action.

### CRAFTERM_PANE_ID & stable id
- [ ] **Env injection** — stableId exposed as `CRAFTERM_PANE_ID`. `pane.ts:145-154`. **Verify:** `echo $CRAFTERM_PANE_ID` → UUID.
- [ ] **Stable id persists** — restore reuses same UUID. `pane.ts:145`. **Verify:** restart → same id.

### Background-process panes
- [ ] **isProcessView (view ≠ kill)** — transient view onto a `BackgroundProcess`; closing keeps PTY alive. `bgproc.ts:138-188`,`types.ts:91`. **Verify:** view → close → process keeps running.
- [ ] **Buffer replay** — seeds xterm with pre-view output. `bgproc.ts:157-158`. **Verify:** open later → see accumulated output.
- [ ] **start/runAndWait/kill/onExit/collect** — `bgproc.ts:42-215`. **Verify:** start hidden; finish → done; kill → row gone.

### Pane status & persistence
- [ ] **Unified NodeStatus + syncPaneStatus** — idle/running/waiting/archived; never overwrites archived. `pane.ts:1040-1052`,`types.ts:87`. **Verify:** running/waiting/archived transitions hold.
- [ ] **refreshPaneInfo (lsof cwd/branch/worktree/lastCommand)** — never null-overwrites; persists cwd. `pane.ts:1235-1287`. **Verify:** `cd` → status bar updates; restart → reopens there.
- [ ] **Double-click rename + commit lock** — `pane.ts:308,1364-1392`. **Verify:** double-click → rename → persists.

---

## 3. Sidebar & Tree

### Modes & search
- [ ] **Five modes (Terminal/Notebook/Database/Docker/Accounts)** — tab strip switches content. `sidebar.ts:338-390`. **Verify:** click each → content + placeholder change.
- [ ] **Shared search** — filters current mode; ArrowDown focuses list, Esc clears. `sidebar.ts:79-110`. **Verify:** type → filtered; Esc → clears.

### Layout
- [ ] **Collapse (Cmd+B)** — `sidebar.ts:121-132`. **Verify:** Cmd+B toggles.
- [ ] **Orientation left/top + size (120-600) + font (9-22) + Cmd+0** — `sidebar.ts:1347-1407`. **Verify:** settings reposition; drag resizes; Cmd+/- font.

### Rows & details
- [ ] **Node types (Tab/Folder/Project/Worktree)** — `types.ts:189-304`. **Verify:** each renders with its icon/behavior.
- [ ] **Tab label + issue-key suffix** — "(CRF-12)" when pane assigned. `sidebar.ts:1048-1051`. **Verify:** assign task → suffix appears.
- [ ] **Detail chevron + status/git/panes lines + panes/plans sub-lists** — `sidebar.ts:320-672`. **Verify:** enable settings → details show; expand → sub-rows; click → focus/open.
- [ ] **Claude status pill (working/ask/idle) + review/test override** — `sidebar.ts:836-915`. **Verify:** Claude state → pill; task review → "review" badge.
- [ ] **Child-count + pin badges + color tags + active class** — `sidebar.ts:499-1083`. **Verify:** badges/colors render; active highlighted.

### Pinned, grouping, recency
- [ ] **Pinned section + breadcrumbs** — `sidebar.ts:440-1170`. **Verify:** pin → moves to Pinned w/ crumb.
- [ ] **Group headers / ungrouped / set-group / drag-to-group** — `sidebar.ts:413-493`. **Verify:** set group → bucketed under header.
- [ ] **Group by recency (Today/Yesterday/Earlier)** — `sidebar.ts:1134-1192`. **Verify:** enable → buckets by activity.

### Keyboard, rename, DnD, context menu
- [ ] **Arrow nav + Enter + Cmd+1..9** — `treeview.ts:446-473`,`sidebar.ts:249-260`. **Verify:** arrows move; Enter activates/toggles; Cmd+N jumps.
- [ ] **Inline rename (dblclick/Cmd+Shift+R, Enter/Esc)** — `treeview.ts:160-267`. **Verify:** rename commits/cancels.
- [ ] **Drag reorder / nest / to-root / drop hints** — `treeview.ts:275-333`. **Verify:** drag → reorders/nests with hints.
- [ ] **Context menu (per node type) + folder settings + show archived + color** — `sidebar.ts:931-1341`. **Verify:** right-click → type-specific actions.

### Worktree management
- [ ] **Auto-reconcile (git worktree list) + container auto-create** — `worktrees.ts:48-110`. **Verify:** external worktree → appears ~periodically.
- [ ] **Archive on git delete / unarchive on recreate** — `worktrees.ts:89-108`. **Verify:** delete → archived; recreate → active.
- [ ] **New/Remove worktree modals (hidden bg process)** — `worktrees.ts:281-330`. **Verify:** new → spinner → node; delete → strikethrough → archived.

### Background processes & iOS in sidebar
- [ ] **Process sub-rows + status dots + stop (×) + click-to-view + collapse-hide** — `sidebar.ts:557-590`. **Verify:** iOS build → sub-row; × kills; click → view.
- [ ] **iOS status dot + ▶ play + ⋯ Build&Run cascade (sim/device→targets→schemes) + Status/Clean/Stop + refresh cache** — `ios-worktree.ts:174-305`. **Verify:** ⋯ → cascading iOS menu; ▶ re-runs last target.

### Sidebar misc
- [ ] **Project defaults (startup/env/shell)** — `types.ts:226-303`,`sidebar.ts:1258-1341`. **Verify:** set → new terminals inherit.
- [ ] **Project features (apps/features/runCommands/supportWorktree/iosApp/issueKeyPrefix)** — `types.ts:251-257`. **Verify:** each surfaces in menus/sidebar.
- [ ] **Archived model (never delete, dormantRoot, show archived)** — `types.ts:200-292`,`sidebar.ts:1024-1039`. **Verify:** close → archived; restore → layout rebuilt.
- [ ] **Tab strips (display modes, hide, reorder, persist)** — `sidebar.ts:707-834`. **Verify:** icon/text/both; hide; drag reorder persists.
- [ ] **Toggle-all-folders + dynamic status/active updates + MAX_FOLDER_DEPTH=4** — `sidebar.ts:135-1247`,`types.ts:633`. **Verify:** toggle all; status updates flicker-free; 4-level nesting.

---

## 4. Pickers, Spotlight, Commands, Keybindings, Dialogs

### Keybindings (customizable — Settings → Shortcuts, Cmd required)
- [ ] New terminal **Cmd+T** · New Claude **Cmd+Shift+T** · Project picker **Cmd+O** · Terminal switcher **Cmd+Shift+O** · Folder picker **Cmd+Alt+P** · Command palette **Cmd+Shift+P** · Focus search **Cmd+Shift+F** · Toggle sidebar **Cmd+B** · New folder **Cmd+Shift+N** · Split right **Cmd+D** · Split+Claude **Cmd+Shift+D** · Split+project **Cmd+Alt+T** · Global search **Cmd+J** · Spotlight **Cmd+P** · Next/Prev pane **Cmd+]**/**Cmd+[** · Distribute **Cmd+Shift+E** · Settings **Cmd+,** · Improve **Cmd+Shift+L** · Daily plan **Cmd+Shift+K** · Rename/New reminder **Cmd+Shift+R**. `keybindings.ts:13-45`. **Verify:** each fires its action; rebinds persist.
- [ ] **Spotlight per-tab shortcuts** (Files/Commands/Claude/Terminals/Shortcuts/Plans/Bookmarks/Apps/Tasks/Projects/Notebooks/Accounts — default unbound). `keybindings.ts:27-38`. **Verify:** bind → jumps to that tab.
- [ ] **Fixed:** Cmd+W close pane · Cmd+1..9 tab jump · Cmd+Alt+Arrow focus pane · Cmd+=/-/0 zoom (context-routed). `commands.ts:1287`,§14. **Verify:** each behaves.

### Dialogs
- [ ] **makeCloseButton / promptText / promptConfirm / promptSelect (+New…) / promptForm** — `dialog.ts:3-355`. **Verify:** Enter resolves, Esc cancels; select "+New" → text prompt.
- [ ] **Close-actions modal (mark done / remove worktree toggles, both ON)** — `dialog.ts:141`. **Verify:** Cmd+W on task/worktree pane → toggles → apply.

### Pickers (`pickers.ts`)
- [ ] **Plans `:57` · Worktree dashboard `:158` · Background processes `:263` · Running devices `:345` · SSH manager `:482` (+edit `:445`) · Claude dashboard `:586` · Project picker `:675` (Enter open / Cmd+Enter split) · Folder path picker `:796` · Markdown finder `:917` · Run applications `:1058` · Run command `:1228` · Run app `:1298` · Feature setup `:1358` · File finder `:1489` · Command palette `:1638` · Claude account switcher `:1772` · Claude resume `:1839` · Terminal switcher `:1932` · Command history `:2052` · Folder browser `:2116` · Stash manager `:2229` · Branch checkout `:2310` · Global search `:2654` · Update modal `:2431`.** **Verify:** each opens, filters, and its primary action works.

### Spotlight (`spotlight.ts:108`)
- [ ] **Cmd+P modal, 13 tabs, Tab/Shift+Tab switch, lazy-load heavy sources, Enter open, Cmd+Enter altRun.** Tabs: All/Files/Commands/Claude/Terminals/Shortcuts/Plans/Bookmarks/Apps/Tasks/Projects/Notebooks/Accounts. `spotlight.ts:146-180`. **Verify:** each tab populates + opens results; Files/Commands/Plans/Backlog lazy-load.

### High-level commands (`commands.ts`)
- [ ] **Terminal/Claude/project creation, split (row/col/with-Claude/with-project/with-IDE), open URL/link/note/SQL/markdown/PR-diff/file-viewer/code-editor, run-in-dir/folder/split, resume Claude, close/archive (running check + close-actions), pop-out/kill, select pane/tab, cycle, equalize, doc font, focus-in-direction, rename/color/pin/collapse/move, run applications, create feature.** `commands.ts:102-1563`. **Verify:** spot-check each (shortcut or menu) → expected behavior.

### Palette seed (`palette-seed.ts`)
- [ ] **~15 git + ~14 linux default cheatsheet commands** inserted into active terminal (no auto-run). `palette-seed.ts:8-37`. **Verify:** Cmd+Shift+P → pick → typed, not run.

### Datepicker (`datepicker.ts`) — reusable
- [ ] **Date/datetime field + popover calendar, `.value` (YYYY-MM-DD) get/set, change event, month nav, time spinners (datetime mode).** `datepicker.ts:17-135`. **Verify:** used in reminders/daily-plan/meeting-notes; pick date → button + event.

---

## 5. Settings (`settings.ts`) — every option persists across restart

### Appearance / Theme
- [ ] Font family `:441` · Terminal font 6-40 `:447` · Background presets `:469` · Custom bg color `:498` · Code editor theme `:456`. **Verify:** change → effect + persists.
- [ ] Theme selector + "Copy colors → Custom" + 22-color ANSI grid (editable only when Custom) `:517-577`. **Verify:** Custom → grid editable; builtin → disabled.

### Sidebar / Tabs
- [ ] Position left/top `:1808` · Sidebar font 9-22 `:1822` · Show status/git/pane-count/panes `:1831` · Group by recency `:1852`. **Verify:** each toggles its UI.
- [ ] Tab display mode (icon/text/both) `:276` · per-tab hide (sidebar + right panel) `:292`. **Verify:** mode changes; hide removes tab.

### Workspace / Commands
- [ ] Code root `:1671` · Code extensions `:1678` · Todo file `:1697` · Explorer root `:1710` · Explorer exclude `:1716` · Notification sound (preview) `:1737` · Keychain service `:1768` · Fallback secret `:1793`. **Verify:** each drives its feature + persists.
- [ ] IDE command `:1336` · Update-zsh command `:1341` · Markdown folders `:1613` · Command palette entries (category/name/command) `:1516`. **Verify:** each used by its action.

### Projects (master-detail) → General/Environment/Apps/Features/Run commands/iOS
- [ ] Ask-project-on-new `:666` · Environments `:678` · Groups `:684` · Project tree `:690`. **Verify:** edits resync sidebar.
- [ ] Per-project: Name/Path/Group/Command/Startup/Shell/IssueKeyPrefix/SupportWorktrees `:1191-1248`; Env vars `:1273`; Apps (name/path/opensAs/per-env commands/run commands) `:933`; Features `:1076`; Run commands `:1125`; iOS (enable + repo/xcode/scheme/bundle/prefix/simulator/worktrees-dir/copy-files) `:1375-1444`. **Verify:** each surfaces in sidebar/menus + persists.

### Reminders / Action menu / Shortcuts / System update / Footer
- [ ] Default hour `:325` · Quick presets `:339`. **Verify:** presets drive reminder form.
- [ ] Action menu editor (add/edit/reorder/hide/delete, builtin rename, reset) `:1866-1985`. **Verify:** changes reflect in sidebar ⋯ menu.
- [ ] Keybindings recorder (Cmd required) + per-shortcut reset `:588-621`. **Verify:** record → new combo works.
- [ ] System update: codebase path `:2027` + update command `:2038`. **Verify:** drives "Update Crafterm".
- [ ] Save-status chip (No changes / Saving… / Saved·HH:MM:SS) + Save-now (`persistNow`) `:233-238`. **Verify:** change → Saving → Saved; Save now flushes.

---

## 6. Right Panel (Alerts / Reminders / Files / Time / PR / Bookmarks)

### Panel & Alerts
- [ ] **Toggle Alt+Cmd+Right + unread badge + clear-all + resizable width** — `notifications.ts:44-100,393`. **Verify:** toggle; badge counts; clear empties; resize persists.
- [ ] **Cards: expand/collapse, accent by event (question amber / done green / reminder blue), message, source chips, project tint, click-to-select (focus pop-out), dismiss, time-ago** — `notifications.ts:406-533`. **Verify:** each card behavior.
- [ ] **Remind-me snooze popover (presets)** — `notifications.ts:567-609`. **Verify:** pick offset → reminder created.
- [ ] **Status-bar: bell toggle + Claude usage chip/popover + usage refresh + thresholds (50/70/80/90/100) + error states + version chip/redeploy** — `notifications.ts:102-331`. **Verify:** usage popover; threshold notifications fire once per window; version highlights when source ahead.

### Reminders
- [ ] **Create/edit form (When datetime, presets, text, type, repeat none/daily/weekly/biweekly/monthly/interval, interval min)** — `reminders.ts:287-385`. **Verify:** form builds reminders; type disabled on edit.
- [ ] **List sorted + upcoming/past sections + repeat badge + edit/remind-again/delete** — `reminders.ts:219-283`. **Verify:** ordering, badges, actions.
- [ ] **20s timer loop → fire (OS + card + sound), repeat re-schedule, advance missed, one-shot→past** — `reminders.ts:138-212,477`. **Verify:** due reminder fires + reschedules.
- [ ] **Payload targets (bookmark/pane/notebook/dailyTask/plan/meetingNote) → card Open action; snooze chips** — `reminders.ts:21-189`,`types.ts:489-495`. **Verify:** fired card opens its target.

### Files / Explorer
- [ ] **Root (follows pane worktree/settings/cwd) + refresh + search (flat ≤500) + tree (lazy) + type icons + git decoration** — `explorer.ts:43-379`. **Verify:** tree loads; search flattens; git colors.
- [ ] **Open (md→viewer, code→editor) + context menu (open/new-page/Finder/rename/exclude/delete) + new file/folder + exclude list** — `explorer.ts:186-331`. **Verify:** each action works on disk + tree.

### Time tracking
- [ ] **Project+feature selectors + add feature + manual start/stop + elapsed display + today summary** — `time.ts:55-196`. **Verify:** start counts up; summary aggregates.
- [ ] **Pomodoro presets (25/30/40) + custom (1-600) + repeat + finish (log+notify+sound)** — `time.ts:199-234`. **Verify:** countdown + finish behavior.
- [ ] **Report modal (today/7/30/all, project→feature breakdown, copy) + auto-tracking (active+focused+activity, 30s tick, 5min idle) + track modal + stop + persistence** — `time.ts:277-506`. **Verify:** report; auto-log; persists.

### Bookmarks
- [ ] **Add/edit (type link/text/code/snippet, title, content, tags) + list (badge, snippet, mono for code) + tag/type filter chips + search + open/copy/remind/edit/delete + reminder chip + empty state** — `bookmarks.ts:40-351`. **Verify:** each behavior.

### PR tab
- [ ] **gh pr diff view + polling (start/stop with visibility)** — `notifications.ts:667-693`. **Verify:** switch to PR tab → diff; polling toggles.

---

## 7. Data Tools (Database / Docker / PR & Deployments / Diff)

### Database
- [ ] **Sidebar tree (groups/connections/objects), new project/folder/connection, rename/delete, drag reorder/nest, color, search** — `database.ts:66-578`. **Verify:** full tree CRUD.
- [ ] **Connection form (PG/MySQL/SQLite, fields, SSL, file path, Test, Save, Edit)** — `database.ts:404-560`. **Verify:** Test → result; Save → tree.
- [ ] **Object introspection (tables/views/procedures, lazy-load, columns PK/auto-inc/default; PG/MySQL/SQLite specific)** — `database.ts:91-122`,`main/db.ts:159-293`. **Verify:** expand → objects; edit → column meta.
- [ ] **SQL pane (Monaco, connection select, Run Cmd+Enter, error, timing, highlight, autocomplete, theme, focus)** — `dbPane.ts:90-414`,`sqlEditor.ts:12-64`. **Verify:** run query → grid + timing.
- [ ] **Result grid (table, sort cycle, persist sort, 1000-row cap, formatting, edit/insert/delete row modals, row-action disabled w/o PK)** — `dbResultGrid.ts:32-378`. **Verify:** sort re-runs; mutations build correct SQL + re-fetch.
- [ ] **Saved queries (.sql list/save/open/delete, live reload)** — `database.ts:91-570`,`dbPane.ts:366-387`. **Verify:** save → appears; open → loads.
- [ ] **Mutation SQL builders (UPDATE/INSERT/DELETE, identifier quoting, literal formatting, NULL, re-run)** — `dbResultGrid.ts:210-466`. **Verify:** reserved-word table quoted; NULL toggle works.

### Docker
- [ ] **Sidebar mode + availability check + retry; tabs containers/images/volumes/networks/compose; search filter** — `docker.ts:345-715`. **Verify:** each tab lists; daemon-down → error+retry.
- [ ] **Container actions (start/stop/restart/remove, logs live, exec interactive — running only)** — `docker.ts:518-554`. **Verify:** each action.
- [ ] **Detail modal (inspect structured + raw JSON, logs xterm, terminal xterm; ports/mounts/networks formatted)** — `docker.ts:225-326`. **Verify:** tabs render.
- [ ] **Image/volume/network remove + inspect; prune (images/volumes/networks); container stats merged** — `docker.ts:556-661`. **Verify:** remove/prune/stats.
- [ ] **Compose start/stop/restart/down** — `docker.ts:680-684`. **Verify:** each compose action.

### PR & Deployments
- [ ] **PR panel (current vs all scope, card: number/title/branch/mergeable/review/checks/comments, draft/state color/current-branch highlight)** — `pr.ts:102-281`. **Verify:** cards reflect status.
- [ ] **PR actions (review→webview, diff→pane, merge squash+delete, create PR --web, refresh)** — `pr.ts:158-214`. **Verify:** each.
- [ ] **Polling (visible only, ~20s busy/5min settled, check-change alert)** — `pr.ts:743-806`. **Verify:** checks update; alert on transition.
- [ ] **Project picker (all scope: searchable multi-select, save, pre-checked)** — `pr.ts:416-521`. **Verify:** select repos → list scoped.
- [ ] **Deployments tab (deployment + workflow-run cards, state badges, open URL/GitHub, job/step logs, completion alert)** — `pr.ts:535-781`. **Verify:** runs/deployments render + open.

### Diff pane
- [ ] **(covered in §2 PR diff pane) — display, file nav/search, line colors, hunks, line numbers, reload, font zoom, selection→terminal, PR comments.** `diffPane.ts:85-529`. **Verify:** see §2.

### Data-tool IPC (main)
- [ ] **db:connect/objects/columns/query/disconnect** `main/db.ts:327-348` · **dbq:list/read/write/delete** `main/index.ts:1454-1502` · **docker:available/containers/images/volumes/networks/compose/stats/inspect/action/prune** `main/docker.ts:44-155` · **pr:available/list/repos/list-all/merge/view/diff/comment** `main/pr.ts:284-455` · **gh:runs/run-jobs/deployments/deploys-all** `main/pr.ts:460-487`. **Verify:** each channel returns expected shape.

---

## 8. Productivity & Content

### Daily Plan (Kanban — `dailyPlan.ts`)
- [ ] **Create/edit/delete task; drag reorder + drag between columns (status)** — `:1041-1171`. **Verify:** card moves + persists.
- [ ] **Columns (backlog/todo/wip(+review/test badges)/done); date nav + range (1/3/7 days); per-column search** — `:20-875`. **Verify:** columns, ranges, filter.
- [ ] **Card (title/desc/priority dot/issue-key or worktree chip/review-test badge/due-date label/tags); actions (▶ Claude / ⏰ remind / ✎ edit / × delete)** — `:945-1019`. **Verify:** all card elements + actions.
- [ ] **Status transitions; priority; date + due-date (overdue red / soon yellow); project select (required); issue-key auto from prefix; worktree slug** — `:95-1322`. **Verify:** each field.
- [ ] **Tags (multi-select, create, 10-color palette, filter OR, manage modal)** — `:797-1637`. **Verify:** create/filter/manage.
- [ ] **Compact view (Notebook sub-tab: status tabs, search, range, open-full) + Cmd+N** — `:496-654`. **Verify:** compact board.
- [ ] **Open in Claude (seeds ultrathink+issueKey+title+desc, assigns task, →In Progress); open in worktree (creates branch+worktree, nests)** — `:217-252`. **Verify:** terminal seeded; worktree nested.
- [ ] **Mark done/review/test from pane menu (+ worktree-delete prompt); assign pane→task; view task details** — `:309-369`. **Verify:** menu actions move task.
- [ ] **Changelog report (range, generate done-tasks markdown, copy)** — `:1792-1814`. **Verify:** generates + copies.

### Meeting Notes (`meetingNotes.ts`)
- [ ] **Create/edit/delete; archive/unarchive; group by project (No project last); newest-first; card (date/title/attendees/project/snippet); remind; Cmd+N; deep-link** — `:34-222`. **Verify:** each behavior.

### Improve / Todo (`improve.ts`, `improveWindow.ts`)
- [ ] **Load todo-list.json (legacy md migration, stable ids); 3-tab layout (Todo/Ready/Done) + Cmd+1/2/3; in-progress + up-next groups; drag reorder backlog; progress bar; search; request feature (Cmd+N, Cmd+Enter save); inline edit; move (mark done/reopen/approve); clear done; detail modal; open-in-window (always-on-top, syncs json); footer path** — `improve.ts:156-797`,`improveWindow.ts:9`. **Verify:** each behavior; window mode syncs.

### Notebook (`notebook.ts`, `markdown.ts`)
- [ ] **Tree (folders/notes), create note/subfolder, rename, delete, colors, show-in-Finder, linked external files, sub-tabs (Notes/Plans/Daily/Meeting), search, remind, markdown render, active highlight** — `notebook.ts:23-140`,`markdown.ts:79`. **Verify:** each behavior.

### Accounts (`accounts.ts`)
- [ ] **Create account/secret, edit, delete (clears secrets); card display (account/secret); custom fields (secret flag → safeStorage); copy; reveal secret (fetch on first); tags; search; kind filter; newest-first; field builder** — `accounts.ts:24-350`. **Verify:** secret values via safeStorage, not JSON.

---

## 9. Backend / Main / IPC / Persistence

### Lifecycle & windows
- [ ] **Main window (fullscreen, traffic lights, preload, webviewTag) + fullscreen broadcast + dev dock icon + reload prevention + custom menu (Cmd+W pane) + two-pass PTY-drain quit** — `main/index.ts:56-2619`. **Verify:** Cmd+R no-op; quit drains PTYs cleanly.
- [ ] **Pop-out window (popout.html?id, pty:adopt, close-confirm) + Improve window (singleton, always-on-top)** — `main/index.ts:263-348`. **Verify:** pop-out streams; improve window floats.

### PTY / shell / background
- [ ] **pty:create (zsh, xterm-256color, cwd restore, CRAFTERM_PANE_ID, ZDOTDIR shim) + pty:input/resize/kill + pty:adopt + zsh preexec last-cmd capture** — `main/index.ts:122-430`. **Verify:** terminal works; last-cmd restored.
- [ ] **proc:start/buffer/attach (hidden PTY, 256KB buffer, view-independent)** — `main/index.ts:208-259`. **Verify:** hidden run + replay.

### Git / Claude
- [ ] **git:branches/stashList/fileStatus/worktrees/worktreeAdd** — `main/index.ts:533-2456`. **Verify:** each returns expected.
- [ ] **claude:latestSession/sessionCwd/sessionTitle/sessionStatus/permissionMode/usageSummary/realUsage/watchSessions/sessions** — `main/index.ts:570-1367`. **Verify:** session detection, usage, watch broadcast.

### Filesystem / notebook / plans / secrets
- [ ] **fs/dir: list, readMd/writeMd, readText/writeText, createFile, mkdir, rename, trash, resolveImport, findFiles; md:findAll** — `main/index.ts:1228-2027`. **Verify:** each op (text cap 2MB, binary rejected).
- [ ] **notebook: tree/read/write/mkdir/create/rename/move(cycle-guard)/delete/reveal** — `main/index.ts:2139-2407`. **Verify:** notebook CRUD under ~/.crafterm/notebooks.
- [ ] **plans: list/scan/forBranch/watched + planFilename parse (owner tags)** — `main/index.ts:1265-1440`,`planFilename.ts:29-51`. **Verify:** plans matched to ownership; watch broadcasts.
- [ ] **secrets:set/get/delete/available (safeStorage)** — `main/index.ts:598-635`. **Verify:** encrypted files; decrypt on get.

### App version / deploy / iOS / sound / zsh / monaco / todo
- [ ] **app:version/buildInfo/repoGit/buildCounter; deploy:build/killAllPtys/swap/wasUpdating** — `main/index.ts:1504-1743`. **Verify:** version chip; self-update flow + loading overlay.
- [ ] **iosWorktree:scriptPath/report/stop; ios:listTargets/listSchemes** — `main/index.ts:2260-2396`. **Verify:** report JSON; targets/schemes enumerate.
- [ ] **sound:play/event; notify (skip if focused, click→focus-pane); zsh:commands; monaco:theme; todo:read/write; backlog:read; ide:open; open-external; markdown:open; shell:revealPath** — `main/index.ts:1218-2486`. **Verify:** each.

### Persistence
- [ ] **store:load/save (atomic temp+rename); stateDir ~/.crafterm[-dev]; SCHEMA_VERSION=4 backup-on-mismatch** — `main/index.ts:448-473`,`state.ts:454`. **Verify:** state round-trips; bad version backed up.
- [ ] **Layout serialization (cwd/claude/bgColor/projectId/status/role/dailyTask…); notifications 24h cap 50; debounced 300ms save + persistNow on app:quitting; loadSettings (safe typed) + action-menu auto-migrate** — `state.ts:288-650`. **Verify:** restart restores everything; new builtins appear.
- [ ] **HR-5 isolation hook (to add): stateDir honors `CRAFTERM_STATE_DIR`; default unchanged.** **Verify (after Phase 0):** env override → temp dir; unset → `~/.crafterm`.

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
| Build-counter debounce | 15min | per-repo |

---

## 12. macOS-specific Dependencies (abstract in a rewrite)

- Hardcoded paths: `/usr/sbin/lsof`, `/bin/zsh`, git/gh/docker binary probes, `~/.claude/...`, `~/.crafterm[-dev]`, `/System/Library/Sounds`.
- cwd discovery via `lsof` on PTY pid. Login `-l` / interactive `-ic` / login+interactive `-lic` shells.
- Native fullscreen, hidden-inset title bar, Notification, Finder reveal, external-URL open, safeStorage (Keychain).
- SSH + DB passwords stored plaintext by design (copy-only, never auto-typed). Monaco bundled (large); ios-worktree.sh + sounds + monaco-themes ship via `extraResources`.
