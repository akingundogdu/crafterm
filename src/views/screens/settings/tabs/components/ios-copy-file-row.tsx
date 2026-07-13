import { Component } from '@geajs/core'

export interface IosCopyFileRowProps {
  rel: string
  onDelete: () => void
}

// One "copy into new worktrees" entry: the relative file path plus a Delete button.
// Rendered as a keyed `.map()` item root (a child Component), so the delete handler
// sits on this row rather than on a nested element in the parent's map.
export default class IosCopyFileRow extends Component {
  declare props: IosCopyFileRowProps

  template({ rel, onDelete }: this['props']) {
    return (
      <div class="palette-admin-row">
        <span class="palette-admin-cmd">{rel}</span>
        <button class="worktree-action worktree-remove" onClick={onDelete}>
          Delete
        </button>
      </div>
    )
  }
}
