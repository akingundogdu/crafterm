import { Store } from '@geajs/core'
import { settings, state, uid } from '@views/state/spine'
import { persistence } from '@repositories/persistence.service'
import { findProjectById } from '@views/catalog/catalog'
import type { WorktreeScript, WorktreeScripts } from '@views/types/types'

export type ScriptPhase = 'pre' | 'post'

// Reactive state + mutations for the Worktree-scripts section, used in two scopes:
// globally (projectId === null → settings.worktreeScripts) and per project
// (→ ProjectNode.worktreeScripts). `pre` / `post` are read in the view's template
// so gea re-renders on add / remove / rename (a bare `void rev` read is NOT
// tracked). Every mutation resolves the RAW target from the tree / settings
// (never a proxied prop object — §gea 5.3), writes, persists, then reloads.
class WorktreeScriptsStore extends Store {
  projectId: string | null = null
  pre: WorktreeScript[] = []
  post: WorktreeScript[] = []

  reload(projectId: string | null): void {
    this.projectId = projectId
    const src = this.target()
    this.pre = [...(src?.pre ?? [])]
    this.post = [...(src?.post ?? [])]
  }

  // The live lists this section edits. A project that has none yet gets them on
  // first write, so an untouched project stays out of the persisted JSON.
  private target(create = false): WorktreeScripts | null {
    if (!this.projectId) return settings.worktreeScripts
    const p = findProjectById(state.tree, this.projectId)
    if (!p) return null
    if (!p.worktreeScripts) {
      if (!create) return null
      p.worktreeScripts = { pre: [], post: [] }
    }
    return p.worktreeScripts
  }

  add(phase: ScriptPhase): void {
    const target = this.target(true)
    if (!target) return
    target[phase] = [...target[phase], { id: uid('ws'), name: '', command: '' }]
    this.commit()
  }

  setName(phase: ScriptPhase, id: string, value: string): void {
    const script = this.target()?.[phase].find((s) => s.id === id)
    if (!script) return
    script.name = value.trim()
    this.commit()
  }

  setCommand(phase: ScriptPhase, id: string, value: string): void {
    const script = this.target()?.[phase].find((s) => s.id === id)
    if (!script) return
    script.command = value.trim()
    // Only the command text changed; no reload, so the focused input is left alone.
    persistence.save()
  }

  remove(phase: ScriptPhase, id: string): void {
    const target = this.target()
    if (!target) return
    target[phase] = target[phase].filter((s) => s.id !== id)
    this.commit()
  }

  private commit(): void {
    persistence.save()
    this.reload(this.projectId)
  }
}

export default new WorktreeScriptsStore()
