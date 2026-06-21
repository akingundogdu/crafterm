import { UITexts } from '@texts'
import { preventAndStop } from '../line-select.state'

interface ActionClusterOptions {
  // Extra buttons appended into the cluster after the "+" (e.g. comment).
  extraActions?: HTMLElement[]
  // Builds the `path:line[-line]` ref to send; null suppresses the send.
  currentRef: () => string | null
  // Paste the ref into a terminal; returns false when none is available.
  sendRef: (ref: string) => boolean
}

interface ActionClusterHandle {
  el: HTMLDivElement
  // Anchor to the given row (rides scroll as its child) and reset the "+" state.
  anchorTo: (row: HTMLElement) => void
  // Detach + hide the cluster.
  hide: () => void
}

// Floating action cluster anchored to the first selected row (left side). Owns the
// "+" button — its send action, the mousedown guard, and the warn/title state —
// plus anchoring and visibility.
export function createActionCluster(opts: ActionClusterOptions): ActionClusterHandle {
  const send = (): void => {
    const ref = opts.currentRef()
    if (!ref) return
    if (!opts.sendRef(ref)) {
      plus.classList.add('warn')
      plus.title = 'Open a terminal first'
    }
  }
  const plus = (
    <button
      class="diff-act diff-act-term"
      title={UITexts.Diff.sendReferenceToTerminal}
      onMouseDown={preventAndStop}
      onClick={(e: MouseEvent) => {
        e.stopPropagation()
        send()
      }}
    >
      +
    </button>
  ) as HTMLButtonElement
  const el = (
    <div class="diff-actions" style={{ display: 'none' }}>
      {plus}
      {opts.extraActions ?? []}
    </div>
  ) as HTMLDivElement

  return {
    el,
    anchorTo: (row: HTMLElement) => {
      row.appendChild(el)
      plus.classList.remove('warn')
      plus.title = 'Send this reference to the terminal'
      el.style.display = ''
    },
    hide: () => {
      el.style.display = 'none'
      if (el.parentElement) el.remove()
    }
  }
}
