import { Component } from '@geajs/core'
import './ssh.css'
import { overlayModal } from '../shared'
import { UITexts } from '@texts'
import {
  sshTarget,
  makeAddClick,
  makeCopyPwdClick,
  makeEditClick,
  makeDeleteClick,
  makeRowClick
} from './ssh.store'
import store from './ssh.store'
import SshConnectionRow from './components/ssh-connection-row'

// ---- SSH connections: saved hosts, connect in a new terminal ----
//
// Connections live in settings.sshConnections (persisted to crafterm-state.json).
// Passwords are stored as plaintext (the user's explicit choice) and are never
// auto-typed: connecting just runs `ssh [...]`, and the saved password is only
// surfaced via a "Copy pwd" button for manual paste at the prompt.

// Reactive body of the SSH picker: heading, "+ New connection", the search box and
// the live-filtered connection list. Rendered as a JSX child of SshPicker so gea
// tracks its store reads and re-renders it on every search keystroke / bump — the
// board pattern. A top-level, imperatively mounted component (SshPicker) does not
// re-subscribe on store writes, so all reactive markup lives here. Self-contained —
// no @ui.
class SshList extends Component {
  declare props: { close: () => void }

  private refresh = (): void => store.reload()

  template({ close }: this['props']) {
    // Read the reactive store fields (the mirrored list + the search) so this child
    // re-renders on any keystroke AND after an add / edit / delete reload.
    const all = store.conns
    const q = store.search.trim().toLowerCase()
    const conns = all.filter(
      (c) => !q || `${c.label ?? ''} ${sshTarget(c)}`.toLowerCase().includes(q)
    )

    return (
      <div class="ssh-picker">
        <h2>{UITexts.Pickers.ssh.connectionsHeading}</h2>
        <button class="settings-inline-btn" onClick={makeAddClick(this.refresh)}>
          + New connection
        </button>
        <input
          class="search-box-input"
          type="text"
          spellcheck="false"
          placeholder="Search connections…"
          value={store.search}
          onInput={(e: Event) => store.setSearch((e.target as HTMLInputElement).value)}
        />
        <div class="pick-list picker-list">
          {conns.map((c) => (
            <SshConnectionRow
              key={c.id}
              conn={c}
              onCopyPwd={makeCopyPwdClick(c.password ?? '')}
              onEdit={makeEditClick(c, this.refresh)}
              onDelete={makeDeleteClick(c, this.refresh)}
              onRowClick={makeRowClick(c, close)}
            />
          ))}
          {conns.length === 0 && (
            <div class="empty-hint">{all.length === 0 ? 'No saved connections yet.' : 'No matches'}</div>
          )}
        </div>
      </div>
    )
  }
}

// Thin shell for the SSH picker, mounted imperatively into the shared overlay modal.
// Data (the modal's close fn) arrives via the constructor into a plain field — a gea
// Component only populates `this.props` when rendered from a parent template, not from
// a manual `new X()`. The reactive markup lives in the SshList JSX child.
export default class SshPicker extends Component {
  private readonly closeFn: () => void

  constructor(opts: { close: () => void }) {
    super()
    this.closeFn = opts.close
  }

  template() {
    return <SshList close={this.closeFn} />
  }
}

export function showSshConnections(): void {
  store.reload()
  const { modal, close } = overlayModal('picker-modal')
  new SshPicker({ close }).render(modal)
  ;(modal.querySelector('.search-box-input') as HTMLInputElement | null)?.focus()
}
