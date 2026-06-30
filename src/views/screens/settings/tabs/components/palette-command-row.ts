import { el } from '@views/lib/dom'
import { UITexts } from '@texts'
import type { PaletteCommand } from '@views/types/types'

interface PaletteCommandRowProps {
  command: PaletteCommand
  onEdit: () => void
  onDelete: () => void
}

// One palette-admin row: command name + text with edit/delete actions.
export function buildPaletteCommandRow(props: PaletteCommandRowProps): HTMLDivElement {
  const { command: c, onEdit, onDelete } = props
  const edit = el('button', { class: 'worktree-action', onClick: onEdit }, UITexts.Settings.commands.edit)
  const del = el('button', { class: 'worktree-action worktree-remove', onClick: onDelete }, UITexts.Settings.commands.delete)
  return el(
    'div',
    { class: 'palette-admin-row' },
    el(
      'div',
      { class: 'palette-admin-text' },
      el('span', { class: 'palette-admin-name' }, c.name),
      el('span', { class: 'palette-admin-cmd' }, c.command)
    ),
    edit,
    del
  )
}
