import { el } from '@views/lib/dom'
import { settings } from '@views/state/spine'
import { UITexts } from '@texts'

interface DetailTogglesProps {
  panel: HTMLElement
  makeToggle: (key: keyof typeof settings.sidebar.details, cb: HTMLInputElement) => () => void
}

// Sidebar per-node detail toggles (status text, git branch, pane count, pane list).
export function buildDetailToggles(props: DetailTogglesProps): void {
  const { panel, makeToggle } = props
  const detailDefs: Array<[keyof typeof settings.sidebar.details, string]> = [
    ['status', UITexts.Settings.sidebar.showStatusText],
    ['git', UITexts.Settings.sidebar.showGitBranch],
    ['panes', UITexts.Settings.sidebar.showPaneCount],
    ['paneList', UITexts.Settings.sidebar.showPanesUnderTerminal]
  ]
  detailDefs.forEach(([key, label]) => {
    const cb = el('input', { type: 'checkbox' })
    cb.checked = settings.sidebar.details[key]
    cb.addEventListener('change', makeToggle(key, cb))
    panel.appendChild(el('label', { class: 'checkbox-row' }, cb, label))
  })
}
