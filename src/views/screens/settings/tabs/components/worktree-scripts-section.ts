import WorktreeScriptsSection from './worktree-scripts-section-view'
import store from './worktree-scripts-section.store'

// Worktree setup scripts: the shell commands run before/after every `git worktree
// add`. Seeds the reactive store for the requested scope — global (Settings →
// Workspace) when `projectId` is null, otherwise the project's own list — then
// mounts the gea section into the given panel host.
export function buildWorktreeScriptsSection(parent: HTMLElement, projectId: string | null): void {
  store.reload(projectId)
  new WorktreeScriptsSection({ isProject: !!projectId }).render(parent)
}
