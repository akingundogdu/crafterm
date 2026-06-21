import { sshConnectionRepo } from '@repositories'
import { overlayModal, makeSearchInput } from '../shared'
import { UITexts } from '@texts'
import {
  filterConnections,
  makeAddClick,
  makeCopyPwdClick,
  makeEditClick,
  makeDeleteClick,
  makeRowClick
} from './ssh.state'
import { sshConnectionRow } from './components/ssh-connection-row'

// ---- SSH connections: saved hosts, connect in a new terminal ----
//
// Connections live in settings.sshConnections (persisted to crafterm-state.json).
// Passwords are stored as plaintext (the user's explicit choice) and are never
// auto-typed: connecting just runs `ssh [...]`, and the saved password is only
// surfaced via a "Copy pwd" button for manual paste at the prompt.
export function showSshConnections(): void {
  const { modal, close } = overlayModal('picker-modal')

  const list = (<div class="pick-list picker-list" />) as HTMLDivElement
  const search = makeSearchInput('Search connections…', () => render())

  const render = (): void => {
    list.replaceChildren()
    if (!sshConnectionRepo.getAll().length) {
      list.appendChild((<div class="empty-hint">No saved connections yet.</div>) as HTMLDivElement)
      return
    }
    const conns = filterConnections(search.value)
    if (!conns.length) {
      list.insertAdjacentHTML('beforeend', '<div class="empty-hint">No matches</div>')
      return
    }
    conns.forEach((c) => {
      list.appendChild(
        sshConnectionRow({
          conn: c,
          onCopyPwd: makeCopyPwdClick(c.password ?? ''),
          onEdit: makeEditClick(c, render),
          onDelete: makeDeleteClick(c, render),
          onRowClick: makeRowClick(c, close)
        })
      )
    })
  }

  const addBtn = (
    <button class="settings-inline-btn" onClick={makeAddClick(render)}>
      + New connection
    </button>
  ) as HTMLButtonElement

  modal.appendChild((<h2>{UITexts.Pickers.ssh.connectionsHeading}</h2>) as HTMLHeadingElement)
  modal.appendChild(addBtn)
  modal.appendChild(search)
  modal.appendChild(list)

  render()
}
