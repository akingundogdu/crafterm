import { Component } from '@geajs/core'
import type { SshConnection } from '@views/types/types'
import { sshTarget } from '../ssh.state'

export interface SshConnectionRowProps {
  conn: SshConnection
  onCopyPwd: (e: MouseEvent) => void
  onEdit: (e: MouseEvent) => void
  onDelete: (e: MouseEvent) => void
  onRowClick: () => void
}

// One saved SSH connection row: title + target, plus copy-pwd / edit / delete
// actions. Rendered as a JSX child of the list, so gea populates `this.props`.
// The repo mutations and refresh stay in the parent, passed in as already-bound
// handlers. Self-contained — no @ui.
export default class SshConnectionRow extends Component {
  declare props: SshConnectionRowProps

  template({ conn, onCopyPwd, onEdit, onDelete, onRowClick }: this['props']) {
    const c = conn
    return (
      <div class="pick-row worktree-row" onClick={onRowClick}>
        <div class="claude-main">
          <span class="claude-title">{c.label || sshTarget(c)}</span>
          <span class="claude-sub">{sshTarget(c) + (c.port ? `:${c.port}` : '')}</span>
        </div>
        {c.password ? (
          <button class="worktree-action" onClick={onCopyPwd}>
            Copy pwd
          </button>
        ) : null}
        <button class="worktree-action" onClick={onEdit}>
          Edit
        </button>
        <button class="worktree-action worktree-remove" onClick={onDelete}>
          Delete
        </button>
      </div>
    )
  }
}
