import { Component } from '@geajs/core'
import './app-card.css'
import type { ProjectCommand } from '@views/types/types'
import LabeledTextField from '../../components/labeled-text-field'
import AppRunCommandRow from './app-run-command-row'

export interface AppCardProps {
  name: string
  path: string
  opensAs: 'tab' | 'split' | undefined
  commands: Record<string, string>
  runCommands: ProjectCommand[]
  environments: string[]
  onNameChange: (v: string) => void
  onPathChange: (v: string) => void
  onOpensAsChange: (v: string) => void
  onCommandChange: (env: string, v: string) => void
  onAddRunCommand: () => void
  onRunCommandNameChange: (rcId: string, v: string) => void
  onRunCommandChange: (rcId: string, v: string) => void
  onDeleteRunCommand: (rcId: string) => void
  onDeleteApp: () => void
}

// One application card in the project editor's Apps tab: head (title + remove), the
// Name / Path fields, an "Opens as" placement dropdown, one command field per
// environment, and the app's optional named run commands. Rendered as a keyed
// `.map()` item root (a child Component); the nested `.map()`s over environments and
// run commands each render their own child Component per row, keeping every handler
// off nested elements inside a map (§gea plugin keyed-map handler bug).
export default class AppCard extends Component {
  declare props: AppCardProps

  template(p: this['props']) {
    const opens = p.opensAs ?? 'split'
    return (
      <div class="settings-app-card">
        <div class="app-card-head">
          <span class="app-card-title">{p.name || '(unnamed app)'}</span>
          <button class="settings-app-delete" title="Remove application" onClick={p.onDeleteApp}>
            {'✕'}
          </button>
        </div>
        <LabeledTextField label="Name" value={p.name} placeholder="backend" onChange={p.onNameChange} />
        <LabeledTextField
          label="Path"
          value={p.path}
          placeholder="relative to project, or absolute (optional)"
          onChange={p.onPathChange}
        />
        <div class="field">
          <label>Opens as</label>
          <select
            class="settings-select"
            onChange={(e: Event) => p.onOpensAsChange((e.target as HTMLSelectElement).value)}
          >
            <option value="split" selected={opens === 'split'}>
              Split (tiled tab)
            </option>
            <option value="tab" selected={opens === 'tab'}>
              Separate tab
            </option>
          </select>
        </div>
        <div class="app-cmd-head">Commands per environment</div>
        {p.environments.map((env) => (
          <LabeledTextField
            key={env}
            label={env}
            value={p.commands[env] ?? ''}
            placeholder={`command for ${env}`}
            onChange={(v: string) => p.onCommandChange(env, v)}
          />
        ))}
        <div class="app-cmd-head">Run commands</div>
        {p.runCommands.map((rc) => (
          <AppRunCommandRow
            key={rc.id}
            name={rc.name}
            command={rc.command}
            onNameChange={(v: string) => p.onRunCommandNameChange(rc.id, v)}
            onCommandChange={(v: string) => p.onRunCommandChange(rc.id, v)}
            onDelete={() => p.onDeleteRunCommand(rc.id)}
          />
        ))}
        <button class="settings-inline-btn app-rc-add" onClick={p.onAddRunCommand}>
          + Add run command
        </button>
      </div>
    )
  }
}
