import { UITexts } from '@texts'

interface MarkdownFolderRowProps {
  path: string
  prettyPath: string
  onDelete: () => void
}

// One markdown-folder row: pretty folder label (full path on hover) + delete.
export function buildMarkdownFolderRow(props: MarkdownFolderRowProps): HTMLDivElement {
  const { path, prettyPath, onDelete } = props
  const label = (<span class="mdfolder-path">{prettyPath}</span>) as HTMLSpanElement
  label.title = path
  const del = (
    <button class="project-del" title={UITexts.Settings.commands.remove}>
      ✕
    </button>
  ) as HTMLButtonElement
  del.addEventListener('click', onDelete)
  return (
    <div class="project-edit-row">
      {label}
      {del}
    </div>
  ) as HTMLDivElement
}
