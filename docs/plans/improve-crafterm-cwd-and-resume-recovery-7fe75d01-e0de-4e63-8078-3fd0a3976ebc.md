# cwd & Resume Recovery

Branch: `improve-crafterm`

## Problem

After a hard kill (force-quit during RAM/CPU exhaustion), every restored terminal
reopened at `~/Users/akingundogdu` and no Claude session resumed.

Root cause: `refreshPaneInfo` (pane.ts) reads cwd via `lsof` (2s timeout in main).
Under system thrash `lsof` times out and returns `null`, and the code does
`pane.cwd = info.cwd` **unconditionally**, wiping a known-good cwd to `null`. The
`cwdChanged` branch then calls `saveSoon()`, and `serializeLayout` drops cwd
entirely when it's null (`if (p?.cwd) leaf.cwd = p.cwd`). So the last on-disk
state had no cwd. On restart `createPty` falls back to `homedir()`. Because Claude
stores sessions per-cwd, `claude --resume <id>` then ran in `~` and found nothing.

## Goals

1. Never overwrite a known-good cwd/branch/worktree with a transient `null`.
2. Seed `pane.cwd` at creation so a pane is never null during the post-restore window.
3. Write the state file atomically (temp + rename) to survive a kill mid-write.
4. cwd-aware Claude resume: if `claudeSessionId` is known but cwd was lost, recover
   the session's real cwd from its `.jsonl`.
5. Raw-terminal last-command resume: capture the literal last command via a zsh
   `preexec` hook, persist it, and on restore **type it without running** (no Enter).

Decisions (confirmed with user):
- cwd cadence: keep the existing 4s poll, just add the null-guard.
- last command: capture via zsh `preexec`; on restore type-but-don't-run.

## Phase A — cwd / resume hardening (core fix, low risk)

### A1. Null-guard in `refreshPaneInfo` (`src/renderer/src/pane.ts`)
- A `null` cwd from `paneInfo` means "couldn't read" (lsof failed / pty gone).
  When `info.cwd === null`, **keep** `pane.cwd/branch/worktree` as-is and skip the
  cwd-change `saveSoon()`. Only assign + maybe-save when `info.cwd !== null`.
- The rest of the tick (plans, claude capture, status) keeps running against the
  retained `pane.cwd`.

### A2. Seed cwd at creation (`src/renderer/src/pane.ts`, `createPane`)
- Replace `cwd: null` in the Pane literal with a best-effort seed: the passed
  `cwd` when it is an absolute path (`cwd?.startsWith('/') ? cwd : null`).
  Restored leaves always pass the saved absolute path, so this closes the
  null-window right after restore; the first lsof tick corrects anything stale.

### A3. Atomic state write (`src/main/index.ts`, `store:save`)
- Write `statePath() + '.tmp'` then `renameSync(tmp, statePath())`. `renameSync`
  is already imported. Prevents a truncated/corrupt JSON if killed mid-write.

### A4. cwd-aware Claude resume
- New main handler `claude:sessionCwd` (`src/main/index.ts`): scan
  `~/.claude/projects/*/` for `<sessionId>.jsonl`, read the first line, return its
  `cwd` field (or null). Reuse `claudeProjectsDir()`.
- Preload: add `claudeSessionCwd(sessionId)` (`src/preload/index.ts` + `api.d.ts`).
- `buildLayout` (`src/renderer/src/main.ts`): when `n.claude && n.claudeSessionId`
  and `!n.cwd`, await `claudeSessionCwd(id)` and use it as the `createPane` cwd
  before sending `claude --resume`.

### A Verify
- `npx tsc --noEmit -p tsconfig.web.json` and `-p tsconfig.node.json`.
- `npm run build`, `npm run dev`: open panes in different dirs + a Claude session;
  confirm cwd shows in the status bar; quit and relaunch → reopen in same dirs,
  Claude resumes. Simulate lost cwd by clearing `leaf.cwd` in the state JSON and
  confirm A4 recovers the Claude pane's dir.

## Phase B — last-command resume (higher risk, independently verifiable)

### B1. zsh preexec capture via a ZDOTDIR shim (`src/main/index.ts`)
- On startup, generate a shim dir `<stateDir>/zdotdir/` with `.zshenv`,
  `.zprofile`, `.zshrc`, `.zlogin`, each sourcing the user's real file from
  `$USER_ZDOTDIR` (guarded with `[ -f ]`), then `.zshrc` appends a `preexec` that
  records the command per pane:
  `crafterm_preexec(){ print -r -- "$1" > "$HOME/.crafterm/last-cmd/$CRAFTERM_PANE_ID" 2>/dev/null }`
- `pty:create` sets `ZDOTDIR=<shim>` and `USER_ZDOTDIR=<original ZDOTDIR or $HOME>`
  in the spawn env (alongside the existing `CRAFTERM_PANE_ID`). Best-effort: every
  source is guarded so an unusual setup still gets a working shell.

### B2. Surface last command to the renderer
- Fold into `pane:info`: accept `stableId`, read
  `~/.crafterm/last-cmd/<stableId>`, return `lastCommand` alongside cwd. One round
  trip, no extra interval.
- `refreshPaneInfo` stores `pane.lastCommand`; add the field to `Pane` (`types.ts`).

### B3. Persist + restore
- `serializeLayout`: write `leaf.lastCommand` when present (skip for claude panes —
  they resume via `--resume`). Add to `SavedLeaf` (`api.d.ts`).
- `buildLayout`: for a non-claude leaf with `lastCommand`, after the shell is up,
  `window.crafterm.input(id, lastCommand)` **without** a trailing `\r`.

### B Verify
- New shells still source the user's real rc (aliases, PATH, prompt intact).
- Run `npm run dev` in a raw pane, quit, relaunch → command is pre-typed at the
  prompt, not executed. Confirm a Claude pane ignores lastCommand and uses resume.

## Out of scope
- Detecting/resuming the actual running foreground process (ps-based) — rejected in
  favor of the literal preexec command.
- Auto-running the restored command — rejected for safety (type-but-don't-run).
