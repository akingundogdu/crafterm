import type { IosDevConfig } from '@views/types/types'
import { state } from '@views/state/state'
import { findProjectById } from '@views/catalog/catalog'
import { persistence } from './persistence.service'

// Per-project iOS config is a single embedded value object on ProjectNode
// (ProjectNode.iosConfig), not a collection — so this repo is keyed by the
// owning projectId and exposes get / ensure / set rather than list CRUD.

export const iosConfigRepo = {
  get(projectId: string): IosDevConfig | undefined {
    return findProjectById(state.tree, projectId)?.iosConfig
  },
  // Lazily attach a default config if the project has none yet. No persist —
  // the caller's subsequent field edits persist (matches prior inline behavior).
  ensure(projectId: string, make: () => IosDevConfig): IosDevConfig | undefined {
    const p = findProjectById(state.tree, projectId)
    if (!p) return undefined
    if (!p.iosConfig) p.iosConfig = make()
    return p.iosConfig
  },
  set(projectId: string, cfg: IosDevConfig): void {
    const p = findProjectById(state.tree, projectId)
    if (!p) return
    p.iosConfig = cfg
    persistence.save()
  }
}
