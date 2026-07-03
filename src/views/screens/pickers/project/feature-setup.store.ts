import { Store } from '@geajs/core'
import type { Application } from '@views/types/types'

// Reactive state for the "new feature" modal's application section. The active
// environment plus the per-app include (`incl`) and worktree (`wt`) flags are the
// source of truth read directly in the feature-apps section so gea re-renders it on
// every environment switch / checkbox toggle — the board pattern (no `void
// store.rev`). Switching environment resets include to its default (ticked when the
// app has a command for that environment) and clears worktree, matching the legacy
// renderApps(). The name / branch / base text inputs live in the (single-render)
// shell and are read imperatively, so they stay out of this reactive store.
class FeatureSetupStore extends Store {
  apps: Application[] = []
  env = ''
  incl: boolean[] = []
  wt: boolean[] = []

  reset(apps: Application[], env: string): void {
    this.apps = apps
    this.env = env
    this.incl = includeDefaults(apps, env)
    this.wt = apps.map(() => false)
  }

  setEnv(env: string): void {
    this.env = env
    this.incl = includeDefaults(this.apps, env)
    this.wt = this.apps.map(() => false)
  }

  setIncl(index: number, value: boolean): void {
    const next = [...this.incl]
    next[index] = value
    this.incl = next
  }

  setWt(index: number, value: boolean): void {
    const next = [...this.wt]
    next[index] = value
    this.wt = next
  }

  // Included apps paired with their worktree flag, in list order.
  chosen(): { app: Application; worktree: boolean }[] {
    return this.apps
      .map((app, i) => ({ app, worktree: this.wt[i], include: this.incl[i] }))
      .filter((x) => x.include)
      .map(({ app, worktree }) => ({ app, worktree }))
  }
}

function includeDefaults(apps: Application[], env: string): boolean[] {
  return apps.map((a) => !!(a.commands?.[env] ?? '').trim())
}

export default new FeatureSetupStore()
