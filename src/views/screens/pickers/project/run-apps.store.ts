import { Store } from '@geajs/core'
import type { Application } from '@views/types/types'

// Reactive state for the "run applications" modal. The active environment and the
// per-app checked flags are the source of truth read directly in the run-apps view
// so gea re-renders it on every environment switch / checkbox toggle — the board
// pattern (no `void store.rev`; the mutated fields are what the template reads).
// Switching environment resets each checkbox to its default (checked when the app
// has a command for that environment), matching the legacy renderApps().
class RunAppsStore extends Store {
  apps: Application[] = []
  env = ''
  checked: boolean[] = []

  reset(apps: Application[], env: string): void {
    this.apps = apps
    this.env = env
    this.checked = defaults(apps, env)
  }

  setEnv(env: string): void {
    this.env = env
    this.checked = defaults(this.apps, env)
  }

  setChecked(index: number, value: boolean): void {
    const next = [...this.checked]
    next[index] = value
    this.checked = next
  }

  // Apps whose row is ticked, in list order.
  selected(): Application[] {
    return this.apps.filter((_, i) => this.checked[i])
  }
}

function defaults(apps: Application[], env: string): boolean[] {
  return apps.map((a) => !!(a.commands?.[env] ?? '').trim())
}

export default new RunAppsStore()
