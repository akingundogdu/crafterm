import { el } from '@views/lib/dom'
import { UITexts } from '@texts'

interface MarkdownFolderRowProps {
  path: string
  prettyPath: string
  onDelete: () => void
}

// One markdown-folder row: pretty folder label (full path on hover) + delete.
export function buildMarkdownFolderRow(props: MarkdownFolderRowProps): HTMLDivElement {
  const { path, prettyPath, onDelete } = props
  const label = el('span', { class: 'mdfolder-path' }, prettyPath)
  label.title = path
  const del = el('button', { class: 'project-del', title: UITexts.Settings.commands.remove, onClick: onDelete }, '✕')
  return el('div', { class: 'project-edit-row' }, label, del)
}
