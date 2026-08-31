import { Component } from '@geajs/core'
import WorktreeScriptCard from './worktree-script-card'
import store, { type ScriptPhase } from './worktree-scripts-section.store'
import type { WorktreeScript } from '@views/types/types'

export interface WorktreeScriptListProps {
  phase: ScriptPhase
  scripts: WorktreeScript[]
  empty: string
}

// One phase's script cards (or the empty hint). Its own Component rather than a
// helper method on the section: gea only compiles the JSX inside `template()`, so
// markup returned from a plain method never gets transformed.
export default class WorktreeScriptList extends Component {
  declare props: WorktreeScriptListProps

  template({ phase, scripts, empty }: this['props']) {
    return (
      <div style={{ display: 'contents' }}>
        {scripts.length === 0 && <div class="field-hint">{empty}</div>}
        {scripts.map((s) => (
          <WorktreeScriptCard
            key={s.id}
            name={s.name}
            command={s.command}
            onNameChange={(v: string) => store.setName(phase, s.id, v)}
            onCommandChange={(v: string) => store.setCommand(phase, s.id, v)}
            onDelete={() => store.remove(phase, s.id)}
          />
        ))}
      </div>
    )
  }
}
