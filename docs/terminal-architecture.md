# Terminal Architecture — Context Doc (HR-3)

The terminal is the **brain of Crafterm** — the highest-caution area of the refactor.
This doc explains how terminal logic works end-to-end so every move in Phases 4–5 can be
verified against it. **Behavior must not change** (HR-1); the refactor only relocates the
code described here. Cross-check with `docs/features.md §2`. Line numbers are current-HEAD
and approximate — re-confirm at execution (`pane.ts` 1,434 lines, `main/index.ts` 2,619).

---

## 1. Process split & data path

```
RENDERER (Chromium)                         MAIN (Node.js)                 OS
 xterm.js  ──keystroke──> crafterm.input ──IPC(pty:input)──> pty.write ──> zsh
 xterm.js  <──render──── on('pty:data') <──IPC(pty:data)──── pty.onData <── zsh
 ResizeObserver ─> crafterm.resize ──IPC(pty:resize)──────> pty.resize (SIGWINCH)
```

- **Renderer** (`pane.ts`, `content.ts`, `popout.ts`) draws and captures input only; never touches the shell.
- **Main** (`main/index.ts` `pty:*` handlers + the `Map<id, IPty>` near the top) owns every node-pty process, ownership routing, and pop-out windows.
- **Preload** (`preload/index.ts`) is the only bridge: `crafterm.ptyCreate/input/resize/kill/adopt` + `on('pty:data'|'pty:exit')`.
- One **xterm instance ↔ one PTY**, keyed by `paneId`. A terminal session's screen is a recursive **split tree** (`LayoutNode`); each leaf = one pane.

## 2. Pane data model (`types.ts:33-109`)

Key fields the terminal logic depends on (all must survive the refactor move):
- **Identity:** `id` (runtime), `stableId` (UUID → `CRAFTERM_PANE_ID`, survives restart, used for plan ownership), `term`, `fit`, `el`, `host`, `statusEl`, `htitle`, `ro`.
- **Activity:** `busy`, `busySince`, `attention`, `idleTimer`, `lastActivity`, `lastNotify`, `outputTail`, `lastCols`/`lastRows`.
- **Shell context:** `cwd`, `branch`, `worktree`, `lastCommand`, `title`, `titleLocked`.
- **Claude:** `claude`, `claudeSessionId`, `claudeSpawnedAt`, `claudeSessionLocked`, `claudeStatus` ('in-progress'|'question'|'idle'), `planMode`, `plans[]`, `plansSynced`.
- **Unified model:** `status` (NodeStatus idle/running/waiting/archived), `role` (PaneRole), `projectId`, `appId`, `dailyTaskId`, `isProcessView`.
- **Appearance:** `bgColor`, `fontSize` (null = global).
- **Tracking:** `trackProjectPath`, `trackFeatureId`.

## 3. Lifecycle

1. **Create** (`pane.ts` createPane ~`:145`): allocate `stableId`, build DOM (`.pane-box` header + host), instantiate xterm + FitAddon, register listeners, call `crafterm.ptyCreate({ id, cwd, env:{CRAFTERM_PANE_ID}, … })`.
2. **Spawn** (main `pty:create` `index.ts:122-174`): `pty.spawn(zsh, ['-l'], { env, cwd })`, xterm-256color, restore saved cwd, inject `CRAFTERM_PANE_ID`, route ZDOTDIR shim (preexec last-command capture) when shell-integration ready.
3. **Attach/stream:** main `pty.onData` → `sendToOwner(id, 'pty:data')`; renderer `xterm.write`. Ownership (`owners[id]`) decides main-window vs pop-out target.
4. **Resize:** ResizeObserver → `fit.fit()` → `crafterm.resize(id, cols, rows)`; **no-op guard** skips unchanged cols/rows (prevents spurious SIGWINCH on tab reattach). `pane.ts:133-139,310-319`.
5. **Dispose** (`pane.ts:963-971`): disconnect observer, `term.dispose()`, remove from `panes`/`opened`, `crafterm.ptyKill(id)`.

## 4. Input flow (`pane.ts:261-304`)

- `term.onData` → `crafterm.input(id, data)`.
- **Bracketed-paste line break:** Shift/Alt+Enter wraps CR in `ESC[200~ … ESC[201~` so TUI editors (Claude/Ink) insert a newline instead of submitting. Mirrored in `popout.ts:34-46`.
- **Command buffer:** accumulates printable chars; on CR/LF calls `recordCommand()` (history + Claude detection); Ctrl-C (0x03) / Ctrl-U (0x15) clear the buffer.
- **Command injection delay (350ms):** when pre-typing a restored/seeded command, wait for the login shell to initialize.

## 5. Output & activity detection (`pane.ts:974-1061`)

State machine driving notifications + sidebar status dot:
- Output/keystroke → `markBusy()` sets `busy=true`, `busySince`, updates `lastActivity`, appends to `outputTail` (Claude panes only, ~1500-char rolling tail).
- **700ms** of quiet → idle timer fires. If the run lasted ≥ **3000ms (LONG_RUN_MS)** → consider notifying.
- `notifyPane(event)` where `event` = `'question'` (looksLikeClaudeQuestion → amber bell) or `'done'` (green check). Fires native OS notification + sound + pushes a panel card.
- **Throttle:** skip if within **2000ms** of `lastNotify`. **Unattended check:** notify only if window blurred or a *different* pane is active.

## 6. Claude awareness (`pane.ts:979-1287`, main `claude:*`)

- **Detection:** word-level "claude" in the command flips `pane.claude`; captures `claudeSpawnedAt` just before spawn.
- **Session id:** `claude:latestSession(cwd, since=claudeSpawnedAt)` adopts the jsonl that appeared after spawn (avoids sibling-pane mixup); once captured, `claudeSessionLocked` freezes it.
- **Status:** `claude:sessionStatus` reads jsonl tail → 'in-progress'|'question'|'idle', reconciled with the outputTail question heuristic.
- **Question heuristic:** regex set over `outputTail` (yes/no prompts, `❯`, "confirm?", etc.) distinguishes "waiting on user" from "task done".
- **Title (/rename):** `claude:sessionTitle` reads custom title from jsonl; applied to `pane.title` + sidebar, retried at 1s/3s post-spawn; a per-cwd fs.watch (`claude:watchSessions`) updates it instantly.
- **Permission/plan mode:** `claude:permissionMode` → 'plan' drives `planMode` + the "Clarify" action when a fresh owned plan appears.

## 7. OSC title following (`pane.ts:306, 1096-1114`)

`term.onTitleChange` captures OSC 0/2 sequences → `pane.title` unless `titleLocked` (manual /rename wins). Single-pane tabs mirror the title to `tab.title`.

## 8. Status bar (`pane.ts:1304-1362`)

Bottom segment: tracking-project · branch · worktree · cwd (home → `~`, last segments truncated) + copy-path button. cwd/branch/worktree refreshed by `refreshPaneInfo` (`pane:info` → `lsof` on the PTY pid + git) every ~4s; never overwrites a known cwd with null; persists cwd changes for restore. Clicking the branch opens the checkout picker.

## 9. Plans & plan mode (`pane.ts:1125-1184`)

`refreshPanePlans` scans `<repo>/docs/plans/` filtered by ownership: a plan is owned if its filename carries `--pane-<stableId>` (→ `pane.stableId`) or a trailing `-<sessionId>` (→ `claudeSessionId`). First owned plan auto-expands the sidebar details; a fresh plan during 'plan' permission mode sets `planMode` and surfaces "Clarify".

## 10. Pop-out windows (`popout.ts`, main `popout:*`/`pty:adopt`)

`popout:open` spawns a `BrowserWindow` (`popout.html?id=paneId`); `pty:adopt` reassigns `owners[id]` so PTY output streams to the pop-out's xterm. Main window shows a placeholder (`content.ts:9-24`) with a "Focus window" button. Close is gated by a confirm round-trip if a process is running.

## 11. Background processes & process-view (`bgproc.ts`, main `proc:*`)

Hidden PTYs (e.g. iOS build/run, `git worktree` ops) tracked as `BackgroundProcess` (stableId, role, status, command, cwd, target). Output buffered in main (256KB cap) for replay. `openProcessView` opens a **transient** pane (`isProcessView=true`) attached to a running process — **closing the view must NOT kill the PTY**. `runHiddenAndWait` powers one-shot create/remove flows.

## 12. Persistence & restore (`state.ts:307-354`, main `store:*`)

Layout serialized recursively to `SavedNode` capturing `cwd`, `claude`, `claudeSessionId`, `bgColor`, `fontSize`, `projectId`, `appId`, `dailyTaskId`, `status`, `role`, `titleLocked`, `lastCommand`. On restore: recreate panes with same `stableId`, restore cwd, pre-type `lastCommand` (non-Claude) or `claude --resume <id>` (Claude, after **500ms**). Atomic save via temp+rename; **300ms** debounce; `persistNow()` on `app:quitting`.

## 13. Refactor guardrails (HR-3)

Phase 4 (main) + Phase 5 (renderer) only **relocate** the above:
- **Main:** `terminal.manager.ts` (the `Map<id,IPty>` + owners + popouts + spawn/write/resize/kill, lifted verbatim), `bgproc.manager.ts` (`proc:*`), `terminal.ipc.ts` (thin `pty:*` registration).
- **Renderer `src/renderer/src/terminal/`:** `terminal.ts` (xterm lifecycle), `activity-detection.ts` (§5–§6), `osc-title.ts` (§7), `status-bar.ts` (§8), `process-view.ts` (§11).
- **No edits** to byte piping, the bracketed-paste wrap, resize no-op guard, activity thresholds, or the timing constants in `docs/features.md §11`. Diff old vs new line-by-line; walk the full §2 + §6 checklist with extra scrutiny.
