import { Store } from '@geajs/core'

// Reactive state for the Projects settings panel. `rev` is bumped on every change and
// read (into the output, `data-rev`) by the four reactive columns (env chips, group
// chips, tree, detail) so they re-render — replacing the controller's imperative
// renderEnvs/renderGroups/renderTree/renderDetail calls. `selectedId` is the chosen
// project. `detailEpoch` drives `detailKey`: the ProjectDetail child is keyed by it, so
// a fresh SubTabs mounts ONLY when the detail must truly rebuild (selection / env /
// group-chip / structural change) — NOT on an in-place General/Environment field edit
// (those bump `rev` alone, so the tree/chips refresh but the open sub-tab is preserved),
// mirroring the legacy controller's re-render granularity.
class ProjectsStore extends Store {
  selectedId: string | null = null
  rev = 0
  detailEpoch = 0

  // A fresh detail instance is keyed by (selected project + epoch): selection changes
  // rotate the key via selectedId, env/group-chip/structural changes via detailEpoch.
  get detailKey(): string {
    return `${this.selectedId ?? 'none'}#${this.detailEpoch}`
  }

  // General light re-render: tree + chips refresh, the open detail sub-tab is kept.
  bump(): void {
    this.rev++
  }

  // Change selection: rotates detailKey (fresh detail) via selectedId.
  select(id: string | null): void {
    this.selectedId = id
    this.rev++
  }

  // Force the detail to fully rebuild in place (env / group-chip change), keeping the
  // same selection.
  bumpDetail(): void {
    this.detailEpoch++
    this.rev++
  }
}

export default new ProjectsStore()
