import { settings, state } from '@views/state/spine'
import type { IosDevConfig } from '@views/types/types'

// Union of saved group labels and the ones already in use anywhere in the tree —
// drives the Group field's datalist so the dropdown stays accurate even before the
// user touches Settings → Workspace.
export function computeGroupOptions(): string[] {
  const used = new Set<string>()
  const walk = (nodes: typeof state.tree): void => {
    for (const n of nodes) {
      if ((n.kind === 'project' || n.kind === 'folder') && n.group) used.add(n.group)
      if (n.kind === 'project' || n.kind === 'folder') walk(n.children)
    }
  }
  walk(state.tree)
  for (const g of settings.groups) used.add(g)
  return [...used].sort((a, b) => a.localeCompare(b))
}

// Per-project iOS worktree config (Settings → Projects → [project] → iOS). The
// repo root is the project's own path. Every field is optional: empty values are
// auto-detected by the bundled ios-worktree.sh, so each iOS project is independent.
export function defaultIosConfig(): IosDevConfig {
  return {
    project: '',
    scheme: '',
    baseBundleId: '',
    displayPrefix: '',
    defaultSimulator: '',
    copyFiles: [],
    worktreesDir: ''
  }
}
