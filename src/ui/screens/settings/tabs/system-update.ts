import { settings } from '../../../state'
import { persistence } from '@services/storage/persistence.service'
import { labeledInput } from '../shared'

export function buildSystemUpdatePanel(panel: HTMLElement): void {
  panel.insertAdjacentHTML('beforeend', '<h3>System update</h3>')
  panel.insertAdjacentHTML(
    'beforeend',
    '<div class="field-hint">The sidebar “Update Crafterm” action runs this command in your Crafterm source checkout, then swaps the built app into /Applications and relaunches.</div>'
  )

  const repo = labeledInput(panel, 'Codebase path', 'text', settings.repoPath, (v) => {
    settings.repoPath = v.trim()
    persistence.save()
  })
  repo.style.maxWidth = '320px'
  repo.placeholder = '~/path/to/crafterm'
  panel.insertAdjacentHTML(
    'beforeend',
    '<div class="field-hint">Local clone of the Crafterm source repo (must contain package.json).</div>'
  )

  const cmd = labeledInput(panel, 'Update command', 'text', settings.updateCommand, (v) => {
    settings.updateCommand = v.trim() || 'run-crafterm-deploy'
    persistence.save()
  })
  cmd.style.maxWidth = '320px'
  cmd.placeholder = 'run-crafterm-deploy'
  panel.insertAdjacentHTML(
    'beforeend',
    '<div class="field-hint">Shell command run in the codebase path. Must produce <code>dist/Crafterm.app</code>. Defaults to <code>run-crafterm-deploy</code>.</div>'
  )
}
