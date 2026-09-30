import { join } from 'path'
import { existsSync, readFileSync } from 'fs'
import * as terminal from '@core/services/terminal.manager/terminal.manager.service'
import { paneCwd } from '@core/services/exec/exec.service'
import * as gitCache from '@core/services/git/git-cache.service'
import { lastCmdDir, paneCwdDir, claudeSessionMapDir } from '@core/services/paths/paths.service'
import type { PaneInfo } from './pane.types'

// Pane info domain logic (pane:*): a pane's cwd (pid → lsof), git branch/worktree,
// and the last command it ran. No IPC wiring (that's the PaneController adapter).
export class PaneService {
  // A ZDOTDIR shim records each command run in a pane to
  // <stateDir>/last-cmd/<CRAFTERM_PANE_ID>. On restore the renderer pre-types it
  // for raw (non-Claude) panes so the user can resume where they left off.
  private readLastCommand(stableId: string): string | null {
    try {
      const f = join(lastCmdDir(), stableId)
      if (!existsSync(f)) return null
      const s = readFileSync(f, 'utf8').trim()
      // Drop multi-line commands: pre-typing one with embedded newlines would auto-
      // run every line but the last, defeating the type-but-don't-run safety intent.
      if (!s || s.includes('\n')) return null
      return s
    } catch {
      return null
    }
  }

  // The pane's live cwd, as recorded by the shim's chpwd hook
  // (<stateDir>/pane-cwd/<CRAFTERM_PANE_ID>). Reading it is a plain fs read; it
  // replaces spawning lsof on every pane every tick. Null when the file is absent —
  // a shell that never sourced our shim (nested shell, ssh, a non-zsh login) — and
  // the caller then falls back to lsof.
  private readShimCwd(stableId: string): string | null {
    try {
      const f = join(paneCwdDir(), stableId)
      if (!existsSync(f)) return null
      const s = readFileSync(f, 'utf8').trim()
      return s || null
    } catch {
      return null
    }
  }

  // The pane's live Claude session id as recorded by the SessionStart hook
  // (<stateDir>/claude-session/<CRAFTERM_PANE_ID>). This is the authoritative id:
  // it is rewritten on every session start, so it follows a /clear or compact roll
  // that the launch-time --session-id cannot. Null when nothing was recorded.
  private readClaudeSessionId(stableId: string): string | null {
    try {
      const f = join(claudeSessionMapDir(), stableId)
      if (!existsSync(f)) return null
      const s = readFileSync(f, 'utf8').trim()
      return s || null
    } catch {
      return null
    }
  }

  async info(id: string, stableId?: string): Promise<PaneInfo> {
    const lastCommand = stableId ? this.readLastCommand(stableId) : null
    const claudeSessionId = stableId ? this.readClaudeSessionId(stableId) : null
    const p = terminal.get(id)
    if (!p) return { cwd: null, branch: null, worktree: null, lastCommand, claudeSessionId }
    // Prefer the shim-written cwd (fs read); only spawn lsof when it is absent.
    const cwd = (stableId ? this.readShimCwd(stableId) : null) ?? (await paneCwd(p.pid))
    // Branch + worktree come from the cache, which spawns git only when this cwd's
    // HEAD has actually moved (see git-cache.service).
    const { branch, worktree } = cwd
      ? await gitCache.facts(cwd)
      : { branch: null, worktree: null }
    return { cwd, branch, worktree, lastCommand, claudeSessionId }
  }
}
