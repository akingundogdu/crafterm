# Crafterm — Complete Feature Reference

This document is an exhaustive inventory of **every feature and behavior** currently
implemented in Crafterm, intended as the source of truth for a from-scratch
rewrite (Swift / Rust / other native stacks). It describes only what exists today.

Current stack: **Electron + xterm.js + node-pty**, ~8.4k lines TypeScript + ~2.5k
lines CSS. Code references use `file:line` against the current source tree.

---

## 1. Architecture Overview

```
   RENDERER (Chromium / web)          MAIN (Node.js)              OS
   ┌───────────────────────┐      ┌──────────────────┐
   │ xterm.js (draws)      │      │ node-pty         │
   │  keypress  ───────────┼─IPC─>│ pty.write() ─────┼──> zsh
   │  screen    <──────────┼─IPC──┤ pty.onData() <───┼─── zsh output
   └───────────────────────┘      └──────────────────┘
```

- The web layer never touches the shell — it only renders. The Node main process
  spawns `zsh` via `node-pty` and pipes bytes both ways over IPC. The preload
  script (`src/preload/index.ts`) is the single typed, context-isolated bridge
  (`contextBridge.exposeInMainWorld('crafterm', api)`).
- A terminal session's screen layout is a **split tree**; each leaf = one xterm +
  one PTY.
- The sidebar is a separate **folder tree** of terminal sessions ("tabs") and
  folders, persisted across restarts.

---

## 2. Data Model

### 2.1 Split layout tree (per terminal session)
- `Dir = 'row' | 'col'` — `row` = side-by-side, `col` = stacked.
- `LayoutNode` recursive union:
  - Leaf: `{ type:'leaf'; paneId }` — references one live pane.
  - Split: `{ type:'split'; dir; sizes:number[]; children:LayoutNode[] }` — `sizes`
    are flex-grow weights, one per child; children may themselves be splits.
- Splits nest arbitrarily. New panes always start at a 50/50 split.

### 2.2 Pane (live terminal)
- `PaneStatus = 'running' | 'idle' | 'attention'`.
- Fields: `id`, `term` (xterm), `fit` (FitAddon); DOM refs (`el` `.pane-box`,
  `host`, `statusEl`, `htitle`); `ro` (ResizeObserver); activity (`busy`,
  `busySince`, `attention`, `idleTimer`); naming (`title`, `titleLocked`); git
  (`cwd`, `branch`, `worktree`); Claude (`claude`, `claudeSessionId`); appearance
  (`bgColor`, `fontSize`); throttling (`lastNotify`, `lastCols`, `lastRows`).
- **Browser pane**: `{ id, el, webview, url }` — embedded in-app browser pane.
- **Doc pane**: `{ id, el, relPath }` — rendered/editable markdown note pane.

### 2.3 Sidebar tree
A sidebar node is one of **three** kinds: `tab`, `folder`, **`project`**.
- `TabNode`: `kind:'tab'`, `id`, `title`, `titleLocked`, `color`, `pinned`,
  `root` (LayoutNode), `detailsOpen?`. One terminal session = one sidebar row.
- `FolderNode`: `kind:'folder'`, `id`, `name`, `color`, `collapsed`, `pinned`,
  `children`, plus per-folder defaults applied to terminals opened inside:
  `startup?` (command), `env?` (raw `KEY=VALUE` lines), `shell?` (shell override).
- `ProjectNode`: `kind:'project'`, `id`, `name`, `path` (working dir), `command?`,
  `group?`, plus `color`, `collapsed`, `pinned`, `children`, and the same
  per-container `startup?`/`env?`/`shell?` defaults as a folder. A project is a
  first-class **container** (like a folder but bound to a path). See **§17**.
- `MAX_FOLDER_DEPTH = 4` (depth counts folder/project containers uniformly).

### 2.4 Settings (with defaults)
- `themeName` (default `GitHub Dark`); `customTheme` (full color map).
- `font` = `{ family:'Menlo, Monaco, "Courier New", monospace', size:13 }`.
- `bgColor` = `#000000` (terminal/app background).
- `docFontSize` = `15` (markdown doc font).
- `codeRoot` = `''` (base folder for the Cmd+P folder picker; '' = home).
- `todoFile` = `''` (path to the Improve panel's todo-list.md).
- `codeExtensions` — default set (`ts,tsx,js,jsx,mjs,cjs,swift,py,go,rs,java,rb,
  c,cpp,h,hpp,json,css,scss,html,vue,php,sh`); these open with `ide` when clicked.
- `commands` = `{ ide:'ide', openMyZsh:'openmyzsh', mdFolders:[] }`.
- `projects: Project[]`, `sshConnections: SshConnection[]`, `paletteCommands[]`.
- `askProjectOnNew` = `true`.
- `bindings` — keybinding overrides (action id → combo).
- `sidebar` = `{ size:230, orientation:'left', fontSize:13, collapsed:false,
  details:{ status:true, git:true, panes:true } }`.

### 2.5 Persistence
- **Store**: tiny JSON file. Location `~/.crafterm` (packaged) /
  `~/.crafterm-dev` (dev), file `crafterm-state.json`. Pretty-printed JSON.
- **Save debounce**: 300ms (`saveSoon`); `persistNow()` flushes immediately on quit.
- **Saved leaf** persists `cwd`, locked `title`, `claude`/`claudeSessionId`,
  `bgColor` so sessions restore in place.
- **Two-phase quit**: on quit the renderer first persists the intact tree
  (`app:quitting`), then after 200ms the main process kills PTYs — so dying PTYs
  don't overwrite saved state with an empty tree.
- **Legacy migration**: old flat `tabs` list is converted to the folder tree once.

---

## 3. Backend / Main Process (`src/main/index.ts`, `src/preload/index.ts`)

### 3.1 App lifecycle & windows
- App name set to `Crafterm` before ready (menu + notification identity).
- Main window: 1200×800, **launches in native macOS fullscreen**,
  `backgroundColor:#0d1117`, `titleBarStyle:'hiddenInset'` (traffic lights float
  over sidebar), `webviewTag:true` (browser panes). Shows on `ready-to-show`.
- macOS behavior: `window-all-closed` keeps app alive; `activate` recreates window.
- `uncaughtException` guard logs stray teardown errors instead of crashing.
- Destroyed-object guards on every renderer send (`sendToRenderer`/`sendToOwner`).

### 3.2 PTY / shell
- `pty:create({ cwd?, env?, shell? }) → id`. Shell = `opts.shell` → `$SHELL` →
  `/bin/zsh`; spawned as **login shell** (`-l`), `xterm-256color`, initial 80×24,
  `~` expanded, missing cwd falls back to home, env merged over `process.env`.
- Output: `p.onData → pty:data{id,data}` to the owning window. Exit:
  `pty:exit{id}` then cleanup.
- `pty:input{id,data}`, `pty:resize{id,cols,rows}` (try/catch — PTY may be dead),
  `pty:kill{id}`, `pty:adopt{id}` (reassign output owner to a pop-out window).
- No stream parsing in main; OSC titles and bell handled in the renderer.

### 3.3 Pane info / git
- `pane:info{id} → { cwd, branch, worktree }`. cwd via
  `lsof -a -d cwd -p <pid> -Fn` (no shell config needed). Branch via
  `git rev-parse --abbrev-ref HEAD`. Worktree name only when inside a *linked*
  worktree (git dir under `.git/worktrees/`).
- `git:branches{id}` — local branches, most-recent-commit first.
- `git:stashList{id}` — `[{ ref:'stash@{0}', description }]`.
- `git:worktrees{cwd?} → { root, worktrees:[{path,branch}] }`.
- git binary probed at `/opt/homebrew/bin/git`, `/usr/local/bin/git`,
  `/usr/bin/git`, else `git`.

### 3.4 Claude Code integration
- Sessions live under `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`
  (cwd encoded by replacing `/` and `.` with `-`).
- `claude:latestSession{cwd?} → id|null` — newest `.jsonl` (by mtime) for a cwd
  (the session a live Claude is writing to).
- `claude:sessions → [{ id, cwd, summary, mtimeMs }]` — all sessions newest first
  (≤300). Reads only the first 16KB of each file; summary = first user prompt,
  XML-ish tags stripped, whitespace collapsed, sliced to 140 chars.

### 3.5 Filesystem
- `dir:list{path?} → { path, parent, dirs }` — non-hidden subdirs sorted by name,
  for the folder picker.
- `plans:list → [{name,path}]` — `~/.claude/plans` markdown files.
- `md:findAll{root} → { root, files }` — recursive markdown walk; skips symlinks
  and `node_modules/.git/.Trash/.cache`; ≤8000 files; works in dot-folders.
- `fs:readMd` / `fs:writeMd` — gated to `.md/.mdx/.mdc` extensions.
- `todo:read` / `todo:write` — the configured todo-list file (`~` expanded).
- `markdown:open{path}` — opens a file in the user's `markdown` CLI via
  `/bin/zsh -lic`.
- `zsh:commands → { aliases, functions }` — runs `/bin/zsh -ic 'alias; …
  ${(k)functions}'` to extract aliases/functions (excludes `_`-prefixed),
  deduped + sorted (4s timeout, 2MB buffer).

### 3.6 Notebook backend (`<stateDir>/notebooks`)
- `notebook:tree` → recursive `NbNode` tree (dirs first, `.md/.mdx/.mdc` files;
  dotfiles skipped). Path-traversal guard (`nbResolve`).
- `notebook:read`, `notebook:write`, `notebook:mkdir`, `notebook:create`
  (appends `.md` if missing), `notebook:rename` (same parent), `notebook:reveal`
  (Finder), `notebook:delete` (recursive; refuses the notebooks root).

### 3.7 Native OS integration
- `notify{title,body,paneId?}` — native notification; click restores/focuses the
  window and (if `paneId`) focuses the originating pane.
- `open-external{url}` — `https?://` only (never `file:` / arbitrary schemes).
- **App menu** (macOS): app/edit/view roles; **Pane → Close Pane** on Cmd+W (real
  accelerator so it fires even when a `<webview>` has focus); **Window → Close**
  moved to Cmd+Shift+W.
- No background polling/timers/watchers in main; all info computed on demand.

### 3.8 Pop-out windows
- `createPopoutWindow` — 720×480, hosts one pane's terminal in its own window via
  `popout.html?id=<paneId>`; re-opening focuses the existing window. PTY ownership
  reassigned via `pty:adopt`.
- Close interception: native close sends `popout:confirm-close` to the pop-out
  renderer (running-process confirm) unless quitting/allowed; on confirm,
  `popout:close-confirmed` → window closes → `popout:killed` to main window.

---

## 4. Terminal / Pane Features

### 4.1 Lifecycle
- `createPane(cwd?, opts?)` spawns the PTY, builds an xterm (font/theme from
  settings, cursor blink, FitAddon), and a `.pane-box` with header
  (title · `⋯` options · `×` close), terminal host, and a hidden status bar.
- `mountPanes()` opens xterms into the DOM only once each, then fits + resizes.
- `destroyPane` disposes the terminal, observer, idle timer.
- **Per-tab container caching**: each tab's layout DOM stays mounted; switching
  tabs flips `display` only (panes never detach → no xterm scroll/repaint resets).
  Rebuild only when the layout signature changes.

### 4.2 Input handling
- All keystrokes forwarded to the PTY.
- **Shift+Enter / Option+Enter** (no Cmd/Ctrl) insert a newline via a
  bracketed-paste-wrapped CR (`\x1b[200~\r\x1b[201~`) so Ink TUIs (Claude) treat
  it as newline, not submit.
- A command buffer tracks the typed line (ignoring escape sequences); on Enter it
  records the command into history and arms finish-notification.

### 4.3 Activity detection & notifications
- `markBusy` on data; a **700ms** idle timer flips busy→idle.
- The finish-notification is **armed at command submit** (Enter), so even fully
  silent long runs (`sleep`, quiet test suites, a Claude turn) qualify. A command
  that ran ≥ **3000ms** (`LONG_RUN_MS`) fires a `"<title> finished"` notification
  on the idle edge (once per command).
- Notifications fire only when the pane is **unattended** (window blurred or a
  different pane active) and not within **2000ms** of the last notify.
- Terminal **bell** → `attention` status + `"<title> is ready"` notification.
- Every notification also pushes a card into the **right-side notification panel**
  (a persistent, dismissible feed — see **§18**), tagged with the pane's
  folder-path group.
- Status: `attention` > `running` (busy) > `idle`.

### 4.4 Claude awareness
- A typed command is detected as launching Claude when the first program word of
  any `&&`/`||`/`;`/`|` segment contains "claude" (case-insensitive). Marks the
  pane `claude` and saves.
- For Claude panes, the latest session id is captured (`claudeLatestSession`) so
  restore can `claude --resume <id>`.

### 4.5 OSC title following
- `onTitleChange` updates the pane title (unless title-locked). A single-pane,
  unlocked tab mirrors the first pane's title into the sidebar.

### 4.6 Status bar (per pane)
- Shows branch · worktree · cwd (home → `~`, last 4 segments). The **branch
  segment is clickable** → "Checkout branch…". A copy button copies the full cwd
  (shows `✓` for 1100ms). Hidden when empty.
- `refreshPaneInfo` updates cwd/branch/worktree; periodic refresh every **4000ms**
  for all panes.

### 4.7 Pane menu (`⋯`)
- Split right / Split down / Split with project… (opens the project picker in
  split mode via the `splitWithProject` action).
- Create worktree… (when in a repo) — opens a **form** (name + base branch,
  default `main`) and runs `run-create-worktree '<name>' '<base>'` in a split.
- Git: Pull · Commit + push… · Commit + push + PR… · Stash changes… · Stashes…
  These quick-actions run **in the pane's own terminal** (focus + type), so output
  stays visible; they do not open a fresh split.
- Pop out to window.
- Background: Default swatch + 8-color palette (per-pane background override).

### 4.8 Appearance
- `applyAppearance` re-themes all panes, applies font family + effective size.
- Per-pane font zoom (Cmd+/-/0) clamped **6–40**; per-pane background override
  (8 darkened folder-hue colors). Inline rename via double-click on the header
  (locks the title).

### 4.9 Link provider
- Scans terminal lines for `http(s)` URLs and local file paths matching markdown
  extensions + `codeExtensions`. **Cmd+click** activates: URLs → in-app browser
  split; `.md` → built-in viewer; other → `ide '<path>'` in a new split.

### 4.10 Browser pane
- `.browser-pane` with header (title · reload `⟳` · open-external `↗` · `⋯` · `×`)
  and a `<webview>` (`allowpopups`). Title follows `page-title-updated`.

### 4.11 Doc pane (markdown note)
- `.doc-pane` with header (title · reload `⟳` · `Edit` toggle · `×`); preview +
  textarea editor. Reads via `readMd` (absolute) or `nbRead` (notebook); writes
  via `writeMd`/`nbWrite`. **Cmd+S** saves while editing; leaving edit mode saves.

### 4.12 Pane drag-to-rearrange
- Pointer-based drag (5px threshold) from the header grip `⠿`; highlights the
  nearest edge drop zone of the pane under the cursor; drop splits/moves the pane
  accordingly (left/right → row, top/bottom → col).

---

## 5. Layout & Splits

- Splitting replaces a leaf with a 50/50 split holding the target + new pane.
- Resizers between siblings: drag to rewrite the two adjacent `sizes` (clamped
  **0.1–0.9**), live `flexGrow` updates, persisted on mouseup.
- Removing a pane collapses single-child splits automatically (auto-flatten).
- `equalizePanes` resets every split in the active tab to equal sizes.
- Directional pane focus (Cmd+Alt+Arrows) by geometry; at an edge it bridges
  to/from the sidebar. `cyclePane` cycles within the tab (wraps).

---

## 6. Tabs & Sidebar (`src/renderer/src/sidebar.ts`)

### 6.1 Two modes
- Header tabs switch between **Terminal** mode and **Notebook** mode (Cmd+1 /
  Cmd+2). The search bar is shared (placeholder changes per mode).

### 6.2 Tabs (terminal rows)
- New tab (`Cmd+T`, named `zsh N`), new Claude tab (`Cmd+Shift+T`, title-locked,
  runs `claude`). Open project as a tab. Tabs created in the selected group's
  context.
- Click selects; double-click renames inline; right-click context menu.
- Status dot (running/idle/attention, aggregated over the tab's panes).
- Optional detail line (toggle chevron): status text · git branch · pane count,
  each gated by a sidebar setting.

### 6.3 Folders
- Nested up to depth 4; subfolders. Disclosure chevron collapses/expands;
  global expand/collapse-all button. Count badge = tabs in subtree.
- Per-folder settings modal: startup command, shell override, env (`KEY=VALUE`
  lines) — applied to terminals opened inside.

### 6.4 Pinned section
- Pinned nodes (without a pinned ancestor) collect in a "Pinned" section at the
  top, with a breadcrumb of their folder path; the normal tree below excludes them.

### 6.5 Color
- 8-color palette + "No color". A color shows as a left **stripe** (`--row-color`)
  + a light **row tint** (`--row-tint`, 8.5% alpha). Set via context menu.

### 6.6 Drag & drop
- Every row draggable. For folders: top 25% → before, bottom 25% → after, middle
  50% → into. For tabs: top half → before, bottom half → after. Visual indicator
  per mode. Drop on empty space → move to root. Folder-depth limit enforced
  (flashes a message on violation). Refuses dropping a folder into its own subtree.

### 6.7 Navigation & rename
- List is focusable; Arrow keys navigate (Right expands/descends, Left
  collapses/ascends, Enter activates/toggles). Order numbers 1–9 → Cmd+1..9 jump.
- Inline rename (double-click / context menu) for tabs and folders; locked titles
  can be returned to OSC auto-naming ("Auto-name").

### 6.8 Context menu
- Tab: New Claude terminal · Rename · Auto-name (if locked) · Pin/Unpin ·
  Close tab · color strip.
- Folder: New terminal here · New Claude terminal here · New subfolder · Rename ·
  Folder settings… · Pin/Unpin · Delete folder · color strip.

### 6.9 Layout, size, orientation
- Orientation: Vertical (left) or Horizontal (top, Chrome-tab style).
- Resize divider (clamp **120–600**px, persisted). Whole-panel collapse (Cmd+B).
- Independent sidebar font size (clamp **9–22**).

### 6.10 Actions / overflow menu
- Open project… · Commands palette · Claude sessions · Resume Claude session ·
  Switch Claude account · Worktrees · My SSH connections · Show all plans ·
  Command history · Update my zsh config · Improve Crafterm.

---

## 7. Notebook Mode (`src/renderer/src/notebook.ts`)

- A notes feature: a folder/note tree (markdown files under
  `<stateDir>/notebooks`) rendered in the sidebar with the same row structure,
  tree guides and chevrons as the terminal sidebar.
- Per-row actions: folders get **New note** / **New folder**; all rows get
  **Show in Finder** / **Rename** / **Delete**.
- Opening a note opens an editable doc pane (split). Active note highlighted.
- Search via the shared bar prunes the tree to matches (force-expanding folders).
- Keyboard nav mirrors the terminal sidebar (arrows + Enter). Cmd+N new note,
  Cmd+Shift+N new folder, Cmd+Shift+R rename selected (in Notebook mode).

---

## 8. Pickers & Modals (`src/renderer/src/pickers.ts`)

All list pickers use **case-insensitive substring** matching (not fuzzy), with
arrow-key nav, Enter to activate, Escape to close, and `stopPropagation` so global
shortcuts don't fire. Several act by **typing into a terminal** — note the
"insert vs. run" distinction below.

| Picker | Trigger | What it does |
| --- | --- | --- |
| **Command palette** | Cmd+Shift+P | zsh aliases/functions (cached) + user palette commands, grouped by category chips (multi-select). **Inserts** the command into the active terminal (no `\r`) for editing. |
| **Project picker** | Cmd+O / new-terminal / sidebar | "Blank terminal" + saved projects. ⏎ open in new tab · ⌘⏎ split right. Split mode for the split-with-project flow. |
| **Folder picker** | Cmd+P | Directory browser from `codeRoot`. → enter · ← parent · ⏎ open a terminal in that folder. |
| **Folder path picker** | Settings (md folders) | Same browser but returns a chosen path (Promise). |
| **Worktree dashboard** | sidebar | Lists git worktrees of the active repo. Row → open terminal there; Claude → open running `claude`; Remove → `git worktree remove`. + New worktree. |
| **SSH manager** | sidebar | Saved connections (plaintext password, never auto-typed — Copy pwd only). Row → run `ssh`. Add/Edit/Delete. |
| **Claude sessions dashboard** | sidebar | All open Claude panes, live-updating every 1s. Row → jump to pane. |
| **Resume Claude session** | sidebar | All historical Claude sessions from `~/.claude`. Row → `claude --resume <id>` in a new terminal. |
| **Switch Claude account** | sidebar | Discovers `claude-switch-*` zsh commands; runs the chosen one. |
| **Plans modal** | sidebar | `~/.claude/plans` files → open in the Markdown app. |
| **All-markdown finder** | Cmd+O (Notebook) | Folder chips (from settings) → `findAllMarkdown`; row → open file read-only. |
| **Terminal switcher** | Cmd+Shift+O | Every open pane (status, group, branch/cwd). Row → focus pane. |
| **Command history** | sidebar | App-tracked commands (newest first). Row/Copy → clipboard. |
| **Stash manager** | pane action | Stashes of the pane's repo. Apply / Drop (confirmed) run in the pane's terminal. |
| **Branch checkout** | pane action / status bar | Branches of the pane's repo. Row → `git checkout` in the pane's terminal. |

---

## 9. Settings (`src/renderer/src/settings.ts`)

macOS-style modal: left category nav + right panel. **All settings apply live and
persist** (no Save button). Categories:

- **Appearance**: font family, terminal font size (6–40), background (preset
  swatches + custom color picker).
- **Theme**: theme dropdown (7 bundled + "Custom"); "Copy current colors →
  Custom"; full custom color editor — 22 keys (bg, fg, cursor, cursorAccent,
  selection bg/fg, and 16 ANSI colors) each with a color picker + hex input
  (editable only when Custom).
- **Sidebar**: position (left/top), sidebar font size (9–22), detail toggles
  (status / git / pane count).
- **Workspace**: code root, code file extensions (open with `ide`), todo list file.
- **Projects**: "ask which project on new terminal" toggle; per-project rows
  (name/path/command) with drag-to-reorder, add, delete.
- **Commands**: `ide` command, `openmyzsh` command; markdown folders (OS folder
  picker, become Cmd+O finder chips); command-palette admin (add/edit/delete
  entries grouped by category).
- **Shortcuts**: per-action rebinding — click a row, press a new Cmd-combo;
  per-row reset to default.

---

## 10. Theming (`src/renderer/src/themes.ts`)

- 7 bundled themes: **GitHub Dark** (default), Dracula, One Dark, Nord, Solarized
  Dark, Tokyo Night, Monokai. Each defines bg/fg/cursor/cursorAccent + 16 ANSI
  colors (xterm.js `ITheme` shape).
- **Forced selection color**: `withSelection` overrides selection to yellow
  (`#ffd33d` on `#0d1117`) on top of *every* theme (cmux-style). The user
  `bgColor` always overrides the theme background.

---

## 11. Improve — Todo Editor (`src/renderer/src/improve.ts`)

- Opens the configured `todo-list.md` (Cmd+Shift+L / sidebar). The file is human-
  editable markdown: verbatim preamble + `## Section` headings + `*` bullets.
- Sections: In progress / Backlog (→ "Up next") / Ready to test / Done.
- Three tabs (Todo / Ready to test / Done) with counts; a stats overview (chips +
  "N% done" progress bar).
- Per-item: inline edit (✎); Mark done (✓); Reopen; Approve; Done "Clear all"
  (confirmed). **Backlog items drag-to-reorder** (file order = AI work order).
- "+ Request new feature" appends to Backlog. If `todoFile` unset, prompts to set
  it in Settings → Workspace.
- Item priority badge from a leading `N.`/`N)`.

---

## 12. Markdown Renderer (`src/renderer/src/markdown.ts`)

Dependency-free Markdown → HTML (everything escaped first). Supported:
- Fenced code blocks (``` ``` ```; language ignored; unclosed flushed at EOF).
- GFM tables (with per-column alignment via `:` markers; outer pipes optional).
- Headings `#`..`######`; horizontal rule (3+ `-`/`*`/`_`).
- Single-line blockquotes; unordered/ordered lists; task lists (`[ ]`/`[x]`).
- Paragraphs.
- Inline: code, images (before links), bold (`**`/`__`), strikethrough (`~~`),
  italic (`*`), links (`rel="noreferrer"`).

**Not supported**: multi-line/nested blockquotes, setext headings, reference
links, footnotes, autolinks, HTML passthrough, single-`_` italic, indented code
blocks.

---

## 13. Pop-out Windows (`src/renderer/src/popout.ts`)

- Only plain terminal panes pop out (not browser/doc). The leaf stays in the
  layout as a placeholder ("… is open in a separate window" + "Focus window");
  the live xterm moves to a 720×480 window that **adopts the same PTY**.
- The pop-out re-creates the xterm with the user's font/theme/bg, adopts the PTY
  (`adoptPane`), mirrors Shift+Enter newline behavior, and resizes via its own
  ResizeObserver.
- Native close prompts only if a process appears running (data within 700ms);
  confirming kills the pane in the main window.

---

## 14. Keyboard Shortcuts

### Customizable (Cmd required; rebindable in Settings → Shortcuts)
| Action | Default |
| --- | --- |
| New terminal | Cmd+T |
| New Claude terminal | Cmd+Shift+T |
| Open project picker (markdown finder in Notebook) | Cmd+O |
| Terminal switcher | Cmd+Shift+O |
| Folder picker | Cmd+P |
| Command palette | Cmd+Shift+P |
| Focus search | Cmd+Shift+F |
| Toggle sidebar | Cmd+B |
| New folder | Cmd+Shift+N |
| Split right | Cmd+D |
| Split with Claude | Cmd+Shift+D |
| Next / Previous pane | Cmd+] / Cmd+[ |
| Distribute panes evenly | Cmd+Shift+E |
| Settings | Cmd+, |
| Improve Crafterm | Cmd+Shift+L |
| Rename selected | Cmd+Shift+R |

### Fixed (not rebindable)
- Cmd+Alt+Left → toggle sidebar · Cmd+Alt+Right → toggle notification panel.
- Cmd+Alt+Up/Down → focus pane in direction.
- Cmd+`=`/`+` zoom in · Cmd+`-` zoom out · Cmd+`0` reset (routed to doc/sidebar/
  terminal depending on focus).
- Cmd+1 → Terminal mode · Cmd+2 → Notebook mode (also Cmd+1..9 row jumps in list).
- Cmd+W → close active pane (menu accelerator). Cmd+S → save doc (in editor).

---

## 15. Timing Constants (behavioral fingerprints)

| Constant | Value | Purpose |
| --- | --- | --- |
| Save debounce | 300ms | Persist after edits |
| Idle/busy timer | 700ms | running → idle edge |
| Long-run threshold | 3000ms | min runtime to notify "finished" |
| Per-pane notify debounce | 2000ms | Avoid notification spam |
| Notification-click refocus | 80ms | Window settle before focusing pane |
| Status-copy "✓" reset | 1100ms | Copy feedback |
| Command injection delay | 350ms | Let login shell init before typing |
| Claude restore delay | 500ms | Before `claude --resume/--continue` |
| Periodic cwd/git refresh | 4000ms | All panes |
| Toast duration | 1800ms | Transient messages |
| Drag threshold | 5px | Start a pane drag |
| Resizer fraction clamp | 0.1–0.9 | Split sizes |
| Terminal font clamp | 6–40 | Per-pane zoom |
| Doc font clamp | 10–28 | Markdown doc zoom |
| Sidebar font clamp | 9–22 | Sidebar text |
| Sidebar size clamp | 120–600px | Resize divider |
| Command history cap | 1000 (≤500 chars) | Tracked commands |
| Notifications cap | 100 | Notification panel |

---

## 16. macOS-specific Dependencies (must be replaced/abstracted in a rewrite)

- Hardcoded paths: `/usr/sbin/lsof`, `/bin/zsh`, git binary probe list,
  `~/.claude/...`, `~/.crafterm[-dev]`.
- cwd discovery via `lsof` on the PTY pid (no shell config required).
- Login shell (`-l`), interactive shell (`-ic` for command extraction),
  login+interactive (`-lic` for the markdown opener).
- Native macOS fullscreen, hidden-inset title bar, notifications, Finder reveal,
  external-URL open.
- SSH passwords stored plaintext by design (copy-only, never auto-typed).

---

## 17. Project Nodes (sidebar project containers)

A **project** is a first-class sidebar container (`kind:'project'`, see §2.3) — like
a folder, but bound to a working `path`, with an optional default `command` and a
`group` label. It elevates the saved-`Project[]` picker concept into the tree itself.

- **Model/helpers** (`tree.ts`): `isContainer()` treats folder + project uniformly;
  `makeProject()` builds a project node; `projectOf(node)` finds the nearest
  enclosing project (drives Cmd+T auto-select); `ancestorFolders()` descends through
  projects but **excludes them from the folder breadcrumb trail**.
- **Sidebar rendering** (`sidebar.ts`): the top level is **grouped by project** —
  project-group headers, then projects, then a **"No project"** section for
  non-project nodes; it falls back to the flat tree only when zero projects exist.
  Projects render with a distinct stacked/box icon (vs. the folder glyph) and share
  the folder row builder, context menu, and the folder-settings sheet
  (startup/shell/env).
- **Create / open** (`commands.ts`): `createProject()` prompts name / path /
  command / **group**, pushes a `ProjectNode`, and keeps a Settings → Projects
  template in sync. `openProject()` auto-creates or reuses a `ProjectNode` for the
  path so the opened terminal lands **under its project**.
- **New-terminal auto-select** (`main.ts`): when the selected node is inside a
  project, `newTerminal()` opens a terminal in that **project's path** directly
  (bypassing the project picker). Otherwise it falls back to the picker
  (`askProjectOnNew`) or a blank terminal.
- **Footer**: a **"New project"** button (`#new-project`) alongside new-tab /
  new-claude / new-folder.
- **Persistence**: project nodes serialize `path`, `command`, `group`, `startup`,
  `env`, `shell` and are rebuilt on restore.

## 18. Notification Panel (right-side feed)

A persistent right-side panel mirroring the left sidebar, for tracking async work
across many terminals (`notifications.ts`). Session-only — **never persisted**.

- **Toggle**: `notifState.open` flips the `notif-open` class on `#app`. Bound to
  **Cmd+Alt+Right** (`toggleNotifPanel`); re-renders on open.
- **Cards**: newest-first, capped at **100**. Each card shows the title (with a
  ` · group` suffix, the pane's ancestor-folder path), a **relative timestamp**
  ("just now" / "Nm ago" / "Nh ago" / "Nd ago"), the message body, and a per-card
  **`×` dismiss** button.
- **Click-to-jump**: clicking a card calls `selectPane(paneId)` (if the pane still
  exists) and dismisses it. Notifications **stay until dismissed** — the whole point
  is that you can leave them hanging while focused elsewhere and act later.
- **Clear all**: a `#notif-clear` button empties the feed. Empty state shows a
  "No notifications" placeholder.
- **Source**: every `notifyPane()` (finish / bell / attention) pushes a card via
  `pushNotification(paneId, title, group, message)` in addition to the native OS
  notification. No IPC beyond the existing `notify` channel.

## 19. Default palette commands & other recent changes

- **Default command-palette seed** (`palette-seed.ts`): on first run the command
  palette ships an editable `PALETTE_SEED` cheatsheet (manage in
  Settings → Command palette) with two categories:
  - **git** (~15): status, stage all, commit, push current branch, pull,
    fetch + prune, log (graph), list/switch/new branch, diff (staged),
    stash with message, stash pop, undo last commit (keep changes), discard file.
  - **linux** (~14): `ls -lah`, find by name, recursive grep, processes,
    kill by port (`lsof -ti:PORT | xargs kill -9`), disk free, folder sizes,
    create/extract tar.gz, make executable, symlink, curl headers, follow log,
    recursive `chmod 755`.
- **Live cwd before split** (`commands.ts liveCwd`): splits query the PTY for its
  *current* cwd first, so a split right after `cd` inherits the new dir, not a
  stale cached one.
- **Search added to more modals**: the worktree dashboard, SSH manager, Claude
  sessions dashboard, account switcher, and stash manager now all have a live
  substring filter (previously plain lists).
- **Project `group`**: saved projects (Settings → Projects) gained an optional
  **Group** field; the command-palette admin lists entries grouped by category,
  categories sorted alphabetically.
