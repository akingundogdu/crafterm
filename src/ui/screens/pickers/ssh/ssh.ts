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

  const h = document.createElement('h2')
  h.textContent = 'My SSH connections'
  modal.appendChild(h)

  const addBtn = document.createElement('button')
  addBtn.className = 'settings-inline-btn'
  addBtn.textContent = '+ New connection'
  addBtn.addEventListener('click', () => void editSshConnection().then(render))
  modal.appendChild(addBtn)

  const search = makeSearchInput('Search connections…', () => render())
  modal.appendChild(search)

  const list = document.createElement('div')
  list.className = 'pick-list picker-list'
  modal.appendChild(list)

  const render = (): void => {
    list.replaceChildren()
    if (!sshConnectionRepo.getAll().length) {
      const hint = document.createElement('div')
      hint.className = 'empty-hint'
      hint.textContent = 'No saved connections yet.'
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
      const row = document.createElement('div')
      row.className = 'pick-row wt-row'
      const main = document.createElement('div')
      main.className = 'claude-main'
      const title = document.createElement('span')
      title.className = 'claude-title'
      title.textContent = c.label || sshTarget(c)
      const sub = document.createElement('span')
      sub.className = 'claude-sub'
      sub.textContent = sshTarget(c) + (c.port ? `:${c.port}` : '')
      main.append(title, sub)
      row.appendChild(main)

      if (c.password) {
        const copyBtn = document.createElement('button')
        copyBtn.className = 'wt-act'
        copyBtn.textContent = 'Copy pwd'
        copyBtn.addEventListener('click', (e) => {
          e.stopPropagation()
          void navigator.clipboard.writeText(c.password as string)
          copyBtn.textContent = 'Copied'
          setTimeout(() => (copyBtn.textContent = 'Copy pwd'), 1200)
        })
        row.appendChild(copyBtn)
      }

      const editBtn = document.createElement('button')
      editBtn.className = 'wt-act'
      editBtn.textContent = 'Edit'
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        void editSshConnection(c).then(render)
      })
      row.appendChild(editBtn)

      const rmBtn = document.createElement('button')
      rmBtn.className = 'wt-act wt-remove'
      rmBtn.textContent = 'Delete'
      rmBtn.addEventListener('click', (e) => {
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
      })
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
