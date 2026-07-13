import { Store } from '@geajs/core'
import { state } from '@views/state/spine'
import { findProjectById } from '@views/catalog/catalog'
import type { ProjectCommand } from '@views/types/types'

// Reactive state for the project Run-commands section. `commands` mirrors the
// project's runCommands (read in RunCommandsBody.template so gea re-renders on add /
// remove / rename — the ssh/action-menu pattern; a bare `void rev` read is NOT
// tracked). Keyed by projectId so handlers resolve the RAW project node from the
// tree (never a proxied prop object — §gea 5.3) before mutating + persisting.
class RunCommandsStore extends Store {
  projectId = ''
  commands: ProjectCommand[] = []

  reload(projectId: string): void {
    this.projectId = projectId
    const p = findProjectById(state.tree, projectId)
    this.commands = [...(p?.runCommands ?? [])]
  }
}

export default new RunCommandsStore()
