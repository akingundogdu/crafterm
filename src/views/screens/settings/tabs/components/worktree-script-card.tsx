import { Component } from '@geajs/core'
import { UITexts } from '@texts'
import LabeledTextField from '../../components/labeled-text-field'

export interface WorktreeScriptCardProps {
  name: string
  command: string
  onNameChange: (v: string) => void
  onCommandChange: (v: string) => void
  onDelete: () => void
}

// One worktree setup script: a card with a head (title + remove) and Name /
// Command fields. Rendered as a keyed `.map()` item root (a child Component); the
// title mirrors the name from the reactive store, so a rename re-renders it, while
// the fields stay uncontrolled inputs owned by LabeledTextField.
export default class WorktreeScriptCard extends Component {
  declare props: WorktreeScriptCardProps

  template({ name, command, onNameChange, onCommandChange, onDelete }: this['props']) {
    const texts = UITexts.Settings.worktreeScripts
    return (
      <div class="settings-app-card">
        <div class="app-card-head">
          <span class="app-card-title">{name || texts.unnamed}</span>
          <button class="settings-app-delete" title={texts.remove} onClick={onDelete}>
            {'✕'}
          </button>
        </div>
        <LabeledTextField
          label={texts.name}
          value={name}
          placeholder={texts.namePlaceholder}
          onChange={onNameChange}
        />
        <LabeledTextField
          label={texts.command}
          value={command}
          placeholder={texts.commandPlaceholder}
          onChange={onCommandChange}
        />
      </div>
    )
  }
}
