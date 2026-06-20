import type { SshConnection } from '@ui/types/types'
import { uid } from '@ui/state/state'
import { openTerminalRunning } from '@ui/commands/commands'
import { promptForm, promptConfirm } from '@ui/components/dialog/dialog'
import { sshConnectionRepo } from '@repositories'
import { UITexts } from '@texts'

export function sshTarget(c: SshConnection): string {
  return (c.user ? `${c.user}@` : '') + c.host
}

export function sshCommand(c: SshConnection): string {
  const parts = ['ssh']
  if (c.port) parts.push('-p', String(c.port))
  parts.push(sshTarget(c))
  return parts.join(' ')
}

// Add or edit one connection via the shared form modal (host is required).
export async function editSshConnection(existing?: SshConnection): Promise<void> {
  const values = await promptForm({
    title: existing ? UITexts.Pickers.ssh.editHeading : UITexts.Pickers.ssh.newHeading,
    fields: [
      { key: 'host', label: UITexts.Pickers.ssh.host, value: existing?.host, placeholder: UITexts.Pickers.ssh.hostPlaceholder },
      { key: 'user', label: UITexts.Pickers.ssh.user, value: existing?.user, placeholder: UITexts.Pickers.ssh.userPlaceholder },
      { key: 'port', label: UITexts.Pickers.ssh.port, value: existing?.port ? String(existing.port) : '', placeholder: UITexts.Pickers.ssh.portPlaceholder },
      { key: 'label', label: UITexts.Pickers.ssh.label, value: existing?.label, placeholder: UITexts.Pickers.ssh.labelPlaceholder },
      {
        key: 'password',
        label: 'Password',
        value: existing?.password,
        placeholder: UITexts.Pickers.ssh.passwordPlaceholder
      }
    ],
    confirmText: existing ? UITexts.Pickers.ssh.save : UITexts.Pickers.ssh.add
  })
  if (!values) return // cancelled, or host left empty (the required first field)
  const port = parseInt(values.port, 10)
  const conn: SshConnection = {
    id: existing?.id ?? uid('ssh'),
    host: values.host,
    user: values.user || undefined,
    port: Number.isFinite(port) && port > 0 ? port : undefined,
    label: '',
    password: values.password || undefined
  }
  conn.label = values.label || sshTarget(conn)
  sshConnectionRepo.upsert(conn)
}

// Connections matching the search query (case-insensitive label + target).
export function filterConnections(query: string): SshConnection[] {
  const q = query.trim().toLowerCase()
  return sshConnectionRepo.query(
    (c) => !q || `${c.label ?? ''} ${sshTarget(c)}`.toLowerCase().includes(q)
  )
}

export function makeAddClick(render: () => void): () => void {
  return () => void editSshConnection().then(render)
}

export function makeCopyPwdClick(password: string): (e: MouseEvent) => void {
  return (e) => {
    e.stopPropagation()
    void navigator.clipboard.writeText(password)
    const btn = e.currentTarget as HTMLButtonElement
    btn.textContent = 'Copied'
    setTimeout(() => (btn.textContent = 'Copy pwd'), 1200)
  }
}

export function makeEditClick(c: SshConnection, render: () => void): (e: MouseEvent) => void {
  return (e) => {
    e.stopPropagation()
    void editSshConnection(c).then(render)
  }
}

export function makeDeleteClick(c: SshConnection, render: () => void): (e: MouseEvent) => void {
  return (e) => {
    e.stopPropagation()
    void promptConfirm({
      title: UITexts.Pickers.ssh.deleteTitle,
      message: `Remove "${c.label || sshTarget(c)}" from saved connections?`,
      confirmText: UITexts.Pickers.ssh.delete
    }).then((ok) => {
      if (!ok) return
      sshConnectionRepo.remove(c.id)
      render()
    })
  }
}

export function makeRowClick(c: SshConnection, close: () => void): () => void {
  return () => {
    void openTerminalRunning(sshCommand(c), c.label || sshTarget(c))
    close()
  }
}
