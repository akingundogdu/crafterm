import type { Application } from '@ui/types'
import { state } from '@ui/state'
import { flattenProjects, findProjectById } from '@ui/catalog'
import { persistence } from '../persistence.service'

// Applications are nested under their owning ProjectNode (ProjectNode.apps). In
// SQLite they become a separate table keyed by projectId (§3.12); until then
// this repository centralizes their access against the live tree, so writes go
// through one seam. Write ops take the owning projectId (the would-be FK).

export const applicationRepo = {
  // Every application across all projects (flattened).
  getAll(): Application[] {
    return flattenProjects(state.tree).flatMap((p) => p.apps ?? [])
  },
  listForProject(projectId: string): Application[] {
    return findProjectById(state.tree, projectId)?.apps ?? []
  },
  get(appId: string): Application | undefined {
    return applicationRepo.getAll().find((a) => a.id === appId)
  },
  upsert(projectId: string, app: Application): void {
    const p = findProjectById(state.tree, projectId)
    if (!p) return
    p.apps = p.apps ?? []
    const i = p.apps.findIndex((a) => a.id === app.id)
    if (i >= 0) p.apps[i] = app
    else p.apps.push(app)
    persistence.save()
  },
  remove(projectId: string, appId: string): void {
    const p = findProjectById(state.tree, projectId)
    if (!p?.apps) return
    p.apps = p.apps.filter((a) => a.id !== appId)
    persistence.save()
  }
}
