import { el } from '@views/lib/dom'
import type { SshConnection } from '@views/types/types'
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
  return el(
    'div',
    { class: 'pick-row worktree-row', onClick: onRowClick },
    el(
      'div',
      { class: 'claude-main' },
      el('span', { class: 'claude-title' }, c.label || sshTarget(c)),
      el('span', { class: 'claude-sub' }, sshTarget(c) + (c.port ? `:${c.port}` : ''))
    ),
    c.password && el('button', { class: 'worktree-action', onClick: onCopyPwd }, 'Copy pwd'),
    el('button', { class: 'worktree-action', onClick: onEdit }, 'Edit'),
    el('button', { class: 'worktree-action worktree-remove', onClick: onDelete }, 'Delete')
  )
}
