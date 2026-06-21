import type { SshConnection } from '@ui/types/types'
import { sshTarget } from '../ssh.state'

interface SshConnectionRowProps {
  conn: SshConnection
  onCopyPwd: (e: MouseEvent) => void
  onEdit: (e: MouseEvent) => void
  onDelete: (e: MouseEvent) => void
  onRowClick: () => void
}

// One saved SSH connection row: title + target, plus copy-pwd / edit / delete
// actions. Pure factory — the repo mutations and re-render stay in the parent,
// passed in as already-bound handlers.
export function sshConnectionRow({
  conn,
  onCopyPwd,
  onEdit,
  onDelete,
  onRowClick
}: SshConnectionRowProps): HTMLDivElement {
  const c = conn
  const row = (
    <div class="pick-row worktree-row">
      <div class="claude-main">
        <span class="claude-title">{c.label || sshTarget(c)}</span>
        <span class="claude-sub">{sshTarget(c) + (c.port ? `:${c.port}` : '')}</span>
      </div>
      {c.password && (
        <button class="worktree-action" onClick={onCopyPwd}>
          Copy pwd
        </button>
      )}
      <button class="worktree-action" onClick={onEdit}>
        Edit
      </button>
      <button class="worktree-action worktree-remove" onClick={onDelete}>
        Delete
      </button>
    </div>
  ) as HTMLDivElement
  row.addEventListener('click', onRowClick)
  return row
}
