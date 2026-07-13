import { Component } from '@geajs/core'
import { UITexts } from '@texts'

export interface MarkdownFolderRowProps {
  path: string
  prettyPath: string
  onDelete: () => void
}

// One markdown-folder row: pretty folder label (full path on hover) + delete. Rendered
// as a keyed JSX child of the list, so gea populates `this.props` and the delete
// handler binds on the row's own (non-mapped) button. Self-contained — no @ui.
export default class MarkdownFolderRow extends Component {
  declare props: MarkdownFolderRowProps

  template({ path, prettyPath, onDelete }: this['props']) {
    return (
      <div class="project-edit-row">
        <span class="mdfolder-path" title={path}>
          {prettyPath}
        </span>
        <button class="project-del" title={UITexts.Settings.commands.remove} onClick={onDelete}>
          ✕
        </button>
      </div>
    )
  }
}
