import { UITexts } from '@texts'
import type { PaletteCommand } from '@ui/types/types'

interface PaletteCommandRowProps {
  command: PaletteCommand
  onEdit: () => void
  onDelete: () => void
}

// One palette-admin row: command name + text with edit/delete actions.
export function buildPaletteCommandRow(props: PaletteCommandRowProps): HTMLDivElement {
  const { command: c, onEdit, onDelete } = props
  const edit = (<button class="worktree-action">{UITexts.Settings.commands.edit}</button>) as HTMLButtonElement
  edit.addEventListener('click', onEdit)
  const del = (<button class="worktree-action worktree-remove">{UITexts.Settings.commands.delete}</button>) as HTMLButtonElement
  del.addEventListener('click', onDelete)
  return (
    <div class="palette-admin-row">
      <div class="palette-admin-text">
        <span class="palette-admin-name">{c.name}</span>
        <span class="palette-admin-cmd">{c.command}</span>
      </div>
      {edit}
      {del}
    </div>
  ) as HTMLDivElement
}
