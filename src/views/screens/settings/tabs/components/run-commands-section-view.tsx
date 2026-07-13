import { Component } from '@geajs/core'
import { state } from '@views/state/spine'
import { persistence } from '@repositories/persistence.service'
import { findProjectById } from '@views/catalog/catalog'
import type { ProjectNode } from '@views/types/types'
import RunCommandCard from './run-command-card'
import store from './run-commands-section.store'

export interface RunCommandsSectionDeps {
  uid: (prefix: string) => string
}

// Reactive body of the project Run-commands section: heading, empty hint, one
// RunCommandCard per command, and "+ Add command". Rendered as a JSX child of
// RunCommandsSection so gea tracks its `store.commands` read and re-renders on add /
// remove / rename. Every mutation resolves the RAW project node (§gea 5.3), reassigns
// its runCommands, persists, then reloads the store.
class RunCommandsBody extends Component {
  declare props: { deps: RunCommandsSectionDeps }

  private raw(): ProjectNode | null {
    return findProjectById(state.tree, store.projectId)
  }

  private add = (): void => {
    const p = this.raw()
    if (!p) return
    p.runCommands = [...(p.runCommands ?? []), { id: this.props.deps.uid('rc'), name: 'command', command: '' }]
    persistence.save()
    store.reload(store.projectId)
  }

  private nameChange = (rcId: string, v: string): void => {
    const p = this.raw()
    const rc = p?.runCommands?.find((x) => x.id === rcId)
    if (!p || !rc) return
    rc.name = v.trim() || rc.name
    persistence.save()
    store.reload(store.projectId) // refresh the card title
  }

  private commandChange = (rcId: string, v: string): void => {
    const p = this.raw()
    const rc = p?.runCommands?.find((x) => x.id === rcId)
    if (!p || !rc) return
    rc.command = v.trim()
    persistence.save()
  }

  private del = (rcId: string): void => {
    const p = this.raw()
    if (!p) return
    p.runCommands = (p.runCommands ?? []).filter((x) => x.id !== rcId)
    persistence.save()
    store.reload(store.projectId)
  }

  template() {
    const cmds = store.commands
    return (
      <div style={{ display: 'contents' }}>
        <div class="settings-subhead">Run commands</div>
        {cmds.length === 0 && (
          <div class="field-hint">
            No run commands. Add named shell commands (e.g. "Deploy", "Lint") that you can fire from the sidebar.
          </div>
        )}
        {cmds.map((rc) => (
          <RunCommandCard
            key={rc.id}
            name={rc.name}
            command={rc.command}
            onNameChange={(v: string) => this.nameChange(rc.id, v)}
            onCommandChange={(v: string) => this.commandChange(rc.id, v)}
            onDelete={() => this.del(rc.id)}
          />
        ))}
        <button class="settings-inline-btn" onClick={this.add}>
          + Add command
        </button>
      </div>
    )
  }
}

// Thin shell for the Run-commands section, mounted imperatively into its sub-tab
// panel host; `deps` arrive via the constructor. The reactive markup lives in the
// RunCommandsBody JSX child (display:contents root → §gea 5.8).
export default class RunCommandsSection extends Component {
  private readonly deps: RunCommandsSectionDeps

  constructor(deps: RunCommandsSectionDeps) {
    super()
    this.deps = deps
  }

  template() {
    return <RunCommandsBody deps={this.deps} />
  }
}
