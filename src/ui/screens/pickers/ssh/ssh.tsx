import type { SshConnection } from '../../../types'
import { uid } from '../../../state'
import { openTerminalRunning } from '../../../commands'
import { promptForm, promptConfirm } from '../../../dialog'
import { sshConnectionRepo } from '@services/storage/repositories'
import { overlayModal, makeSearchInput } from '../shared'

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
    title: existing ? 'Edit SSH connection' : 'New SSH connection',
    fields: [
      { key: 'host', label: 'Host', value: existing?.host, placeholder: 'example.com or 1.2.3.4' },
      { key: 'user', label: 'User', value: existing?.user, placeholder: 'root' },
      { key: 'port', label: 'Port', value: existing?.port ? String(existing.port) : '', placeholder: '22' },
      { key: 'label', label: 'Label', value: existing?.label, placeholder: 'My server (optional)' },
      {
        key: 'password',
        label: 'Password',
        value: existing?.password,
        placeholder: '(optional · stored as plaintext)'
      }
    ],
    confirmText: existing ? 'Save' : 'Add'
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

  const h = (<h2>My SSH connections</h2>) as HTMLHeadingElement
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
              title: 'Delete connection?',
              message: `Remove "${c.label || sshTarget(c)}" from saved connections?`,
              confirmText: 'Delete'
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
