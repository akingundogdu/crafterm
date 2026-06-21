import { settings } from '@ui/state/state'
import { UITexts } from '@texts'
import { labeledInput } from '../../shared'

interface ExplorerSectionProps {
  panel: HTMLElement
  onSaveRoot: (v: string) => void
  onSaveExclude: (v: string) => void
}

// File explorer section (right panel → Files): root override + exclude list.
export function buildExplorerSection(props: ExplorerSectionProps): void {
  const { panel, onSaveRoot, onSaveExclude } = props
  panel.insertAdjacentHTML('beforeend', `<h3 style="margin-top:18px">${UITexts.Settings.workspace.fileExplorer}</h3>`)
  const exRoot = labeledInput(panel, UITexts.Settings.workspace.explorerRoot, 'text', settings.explorerRoot, onSaveRoot)
  exRoot.style.maxWidth = '280px'
  exRoot.placeholder = '(active terminal cwd)'
  const exExclude = labeledInput(
    panel,
    UITexts.Settings.workspace.exclude,
    'text',
    settings.explorerExclude.join(', '),
    onSaveExclude
  )
  exExclude.style.maxWidth = '280px'
  panel.insertAdjacentHTML(
    'beforeend',
    '<div class="field-hint">Names hidden in the Files panel (comma-separated). Right-click an item there to exclude it.</div>'
  )
}
