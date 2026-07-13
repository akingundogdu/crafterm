import { settings } from '@views/state/spine'
import { UITexts } from '@texts'
import { labeledInput } from '../shared'
import { makeSaveRepoPath, makeSaveUpdateCommand } from './system-update.store'

export function buildSystemUpdatePanel(panel: HTMLElement): void {
  panel.insertAdjacentHTML('beforeend', `<h3>${UITexts.Settings.systemUpdate.heading}</h3>`)
  panel.insertAdjacentHTML(
    'beforeend',
    '<div class="field-hint">The sidebar “Update Crafterm” action runs this command in your Crafterm source checkout, then swaps the built app into /Applications and relaunches.</div>'
  )

  const repo = labeledInput(panel, UITexts.Settings.systemUpdate.codebasePath, 'text', settings.repoPath, makeSaveRepoPath())
  repo.style.maxWidth = '320px'
  repo.placeholder = '~/path/to/crafterm'
  panel.insertAdjacentHTML(
    'beforeend',
    '<div class="field-hint">Local clone of the Crafterm source repo (must contain package.json).</div>'
  )

  const cmd = labeledInput(panel, UITexts.Settings.systemUpdate.updateCommand, 'text', settings.updateCommand, makeSaveUpdateCommand())
  cmd.style.maxWidth = '320px'
  cmd.placeholder = 'run-crafterm-deploy'
  panel.insertAdjacentHTML(
    'beforeend',
    '<div class="field-hint">Shell command run in the codebase path. Must produce <code>dist/Crafterm.app</code>. Defaults to <code>run-crafterm-deploy</code>.</div>'
  )
}
