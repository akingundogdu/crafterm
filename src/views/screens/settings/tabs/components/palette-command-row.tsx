import { Component } from '@geajs/core'
import { UITexts } from '@texts'
import type { PaletteCommand } from '@views/types/types'

export interface PaletteCommandRowProps {
  command: PaletteCommand
  onEdit: () => void
  onDelete: () => void
}

// One palette-admin row: command name + text with edit/delete actions. Rendered as a
// keyed JSX child of the list, so gea populates `this.props` and the handlers bind on
// the row's own (non-mapped) buttons. Self-contained — no @ui.
export default class PaletteCommandRow extends Component {
  declare props: PaletteCommandRowProps

  template({ command, onEdit, onDelete }: this['props']) {
    const c = command
    return (
      <div class="palette-admin-row">
        <div class="palette-admin-text">
          <span class="palette-admin-name">{c.name}</span>
          <span class="palette-admin-cmd">{c.command}</span>
        </div>
        <button class="worktree-action" onClick={onEdit}>
          {UITexts.Settings.commands.edit}
        </button>
        <button class="worktree-action worktree-remove" onClick={onDelete}>
          {UITexts.Settings.commands.delete}
        </button>
      </div>
    )
  }
}
