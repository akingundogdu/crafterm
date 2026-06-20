import type { SshConnection } from '@ui/types/types'
import { uid } from '@ui/state/state'
import { openTerminalRunning } from '@ui/commands/commands'
import { promptForm, promptConfirm } from '@ui/dialog/dialog'
import { sshConnectionRepo } from '@repositories'
import { overlayModal, makeSearchInput } from '../shared'
import { UITexts } from '@texts'

// ---- SSH connections: saved hosts, connect in a new terminal ----
//
// Connections live in settings.sshConnections (persisted to crafterm-state.json).
// Passwords are stored as plaintext (the user's explicit choice) and are never
// auto-typed: connecting just runs `ssh [...]`, and the saved password is only
// surfaced via a "Copy pwd" button for manual paste at the prompt.

function sshTarget(c: SshConnection): string {
  return (c.user ? `${c.user}@` : '') + c.host
}

function sshCommand(c: SshConnection): string {
  const parts = ['ssh']
  if (c.port) parts.push('-p', String(c.port))
  parts.push(sshTarget(c))
  return parts.join(' ')
}

// Add or edit one connection via the shared form modal (host is required).
async function editSshConnection(existing?: SshConnection): Promise<void> {
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

export function showSshConnections(): void {
  const { modal, close } = overlayModal('picker-modal')

  const h = (<h2>{UITexts.Pickers.ssh.connectionsHeading}</h2>) as HTMLHeadingElement
  modal.appendChild(h)

  const addBtn = (
    <button class="settings-inline-btn" onClick={() => void editSshConnection().then(render)}>
      + New connection
    </button>
  ) as HTMLButtonElement
  modal.appendChild(addBtn)

  const search = makeSearchInput('Search connections…', () => render())
  modal.appendChild(search)

  const list = (<div class="pick-list picker-list" />) as HTMLDivElement
  modal.appendChild(list)

  const render = (): void => {
    list.replaceChildren()
    if (!sshConnectionRepo.getAll().length) {
      const hint = (<div class="empty-hint">No saved connections yet.</div>) as HTMLDivElement
      list.appendChild(hint)
      return
    }
    const q = search.value.trim().toLowerCase()
    const conns = sshConnectionRepo.query(
      (c) => !q || `${c.label ?? ''} ${sshTarget(c)}`.toLowerCase().includes(q)
    )
    if (!conns.length) {
      list.insertAdjacentHTML('beforeend', '<div class="empty-hint">No matches</div>')
      return
    }
    conns.forEach((c) => {
      const main = (
        <div class="claude-main">
          <span class="claude-title">{c.label || sshTarget(c)}</span>
          <span class="claude-sub">{sshTarget(c) + (c.port ? `:${c.port}` : '')}</span>
        </div>
      ) as HTMLDivElement
      const row = (<div class="pick-row wt-row">{main}</div>) as HTMLDivElement

      if (c.password) {
        const copyBtn = (
          <button
            class="wt-act"
            onClick={(e: MouseEvent) => {
              e.stopPropagation()
              void navigator.clipboard.writeText(c.password as string)
              copyBtn.textContent = 'Copied'
              setTimeout(() => (copyBtn.textContent = 'Copy pwd'), 1200)
            }}
          >
            Copy pwd
          </button>
        ) as HTMLButtonElement
        row.appendChild(copyBtn)
      }

      const editBtn = (
        <button
          class="wt-act"
          onClick={(e: MouseEvent) => {
            e.stopPropagation()
            void editSshConnection(c).then(render)
          }}
        >
          Edit
        </button>
      ) as HTMLButtonElement
      row.appendChild(editBtn)

      const rmBtn = (
        <button
          class="wt-act wt-remove"
          onClick={(e: MouseEvent) => {
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
          }}
        >
          Delete
        </button>
      ) as HTMLButtonElement
      row.appendChild(rmBtn)

      row.addEventListener('click', () => {
        void openTerminalRunning(sshCommand(c), c.label || sshTarget(c))
        close()
      })
      list.appendChild(row)
    })
  }

  render()
}
