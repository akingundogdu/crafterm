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
// plus anchoring and visibility. Built with plain DOM: the cluster is anchored,
// moved (appended into the selected row) and toggled imperatively by the selection
// engine, and gea's onClick binding does not survive an imperatively-rendered
// component being extracted and re-parented, so a plain factory is the reliable
// primitive for this inherently-imperative widget.
export function createActionCluster(opts: ActionClusterOptions): ActionClusterHandle {
  const clusterEl = document.createElement('div')
  clusterEl.className = 'diff-actions'
  clusterEl.style.display = 'none'

  const plus = document.createElement('button')
  plus.className = 'diff-act diff-act-term'
  plus.title = UITexts.Diff.sendReferenceToTerminal
  plus.textContent = '+'
  clusterEl.appendChild(plus)

  const send = (): void => {
    const ref = opts.currentRef()
    if (!ref) return
    if (!opts.sendRef(ref)) {
      plus.classList.add('warn')
      plus.title = 'Open a terminal first'
    }
  }

  plus.addEventListener('mousedown', preventAndStop)
  plus.addEventListener('click', (e) => {
    e.stopPropagation()
    send()
  })

  for (const a of opts.extraActions ?? []) clusterEl.appendChild(a)

  return {
    el: clusterEl,
    anchorTo: (row: HTMLElement) => {
      row.appendChild(clusterEl)
      plus.classList.remove('warn')
      plus.title = 'Send this reference to the terminal'
      clusterEl.style.display = ''
    },
    hide: () => {
      clusterEl.style.display = 'none'
      if (clusterEl.parentElement) clusterEl.remove()
    }
  }
}
