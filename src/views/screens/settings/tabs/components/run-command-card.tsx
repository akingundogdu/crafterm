import { Component } from '@geajs/core'
import LabeledTextField from '../../components/labeled-text-field'

export interface RunCommandCardProps {
  name: string
  command: string
  onNameChange: (v: string) => void
  onCommandChange: (v: string) => void
  onDelete: () => void
}

// One project run command: a card with a head (title + remove) and Name / Command
// fields. Rendered as a keyed `.map()` item root (a child Component). The card title
// mirrors the name from the reactive store, so a rename re-renders it; the fields
// themselves are uncontrolled inputs owned by LabeledTextField.
export default class RunCommandCard extends Component {
  declare props: RunCommandCardProps

  template({ name, command, onNameChange, onCommandChange, onDelete }: this['props']) {
    return (
      <div class="settings-app-card">
        <div class="app-card-head">
          <span class="app-card-title">{name || '(unnamed command)'}</span>
          <button class="settings-app-delete" title="Remove command" onClick={onDelete}>
            {'✕'}
          </button>
        </div>
        <LabeledTextField label="Name" value={name} placeholder="Deploy" onChange={onNameChange} />
        <LabeledTextField label="Command" value={command} placeholder="npm run deploy" onChange={onCommandChange} />
      </div>
    )
  }
}
