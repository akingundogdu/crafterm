import { settings } from '@ui/state/state'
import { UITexts } from '@texts'
import { labeledInput, labeledSelect } from '../shared'
import {
  SOUNDS,
  saveCodeRoot,
  saveDefaultShell,
  saveCodeExtensions,
  saveTodoFile,
  saveExplorerRoot,
  saveExplorerExclude,
  saveKeychainService,
  buildSecretOptions,
  currentFallbackSecret,
  saveFallbackSecret,
  makeNotifSoundChange
} from './workspace.state'

export function buildWorkspacePanel(panel: HTMLElement): void {
  panel.insertAdjacentHTML('beforeend', `<h3>${UITexts.Settings.workspace.heading}</h3>`)
  const root = labeledInput(panel, UITexts.Settings.workspace.codeRoot, 'text', settings.codeRoot, saveCodeRoot)
  root.placeholder = '(home)'
  root.style.maxWidth = '280px'

  const shell = labeledInput(panel, UITexts.Settings.workspace.defaultShell, 'text', settings.defaultShell, saveDefaultShell)
  shell.placeholder = '($SHELL, then /bin/zsh)'
  shell.style.maxWidth = '280px'

  const ext = labeledInput(
    panel,
    UITexts.Settings.workspace.codeExtensions,
    'text',
    settings.codeExtensions.join(', '),
    saveCodeExtensions
  )
  ext.style.maxWidth = '280px'
  panel.insertAdjacentHTML(
    'beforeend',
    '<div class="field-hint">Clicking these files in a terminal opens them with <code>ide</code>.</div>'
  )

  const todo = labeledInput(panel, UITexts.Settings.workspace.todoFile, 'text', settings.todoFile, saveTodoFile)
  todo.style.maxWidth = '280px'
  todo.placeholder = '~/path/to/todo-list.md'
  panel.insertAdjacentHTML(
    'beforeend',
    '<div class="field-hint">Path to the markdown file shown in the Improve Crafterm panel.</div>'
  )

  // File explorer (right panel → Files)
  panel.insertAdjacentHTML('beforeend', `<h3 style="margin-top:18px">${UITexts.Settings.workspace.fileExplorer}</h3>`)
  const exRoot = labeledInput(panel, UITexts.Settings.workspace.explorerRoot, 'text', settings.explorerRoot, saveExplorerRoot)
  exRoot.style.maxWidth = '280px'
  exRoot.placeholder = '(active terminal cwd)'
  const exExclude = labeledInput(
    panel,
    UITexts.Settings.workspace.exclude,
    'text',
    settings.explorerExclude.join(', '),
    saveExplorerExclude
  )
  exExclude.style.maxWidth = '280px'
  panel.insertAdjacentHTML(
    'beforeend',
    '<div class="field-hint">Names hidden in the Files panel (comma-separated). Right-click an item there to exclude it.</div>'
  )

  // Notification sound (macOS system sounds; '' = off)
  panel.insertAdjacentHTML('beforeend', `<h3 style="margin-top:18px">${UITexts.Settings.workspace.notifications}</h3>`)
  const sel = (
    <select class="settings-select">
      {SOUNDS.map((s) => {
        const o = (<option>{s || UITexts.Settings.workspace.soundOff}</option>) as HTMLOptionElement
        o.value = s
        if (s === settings.notifSound) o.selected = true
        return o
      })}
    </select>
  ) as HTMLSelectElement
  sel.addEventListener('change', makeNotifSoundChange(sel))
  const soundRow = (<div class="settings-row" />) as HTMLDivElement
  soundRow.insertAdjacentHTML('beforeend', `<span class="settings-row-label">${UITexts.Settings.workspace.soundLabel}</span>`)
  soundRow.appendChild(sel)
  panel.appendChild(soundRow)
  panel.insertAdjacentHTML(
    'beforeend',
    '<div class="field-hint">Played when a terminal finishes or Claude needs you. Pick one to preview.</div>'
  )

  // Claude usage — token source for the real `/api/oauth/usage` percentages.
  panel.insertAdjacentHTML('beforeend', `<h3 style="margin-top:18px">${UITexts.Settings.workspace.claudeUsage}</h3>`)
  panel.insertAdjacentHTML(
    'beforeend',
    '<div class="field-hint">The status-bar chip shows Anthropic\'s real session/week limits, read with the OAuth token Claude Code stores in the macOS keychain. Override the keychain service or point at a saved secret as a fallback.</div>'
  )
  const svc = labeledInput(
    panel,
    UITexts.Settings.workspace.keychainService,
    'text',
    settings.claudeUsageAuth.keychainService,
    saveKeychainService
  )
  svc.style.maxWidth = '260px'
  svc.placeholder = 'Claude Code-credentials'

  labeledSelect(panel, UITexts.Settings.workspace.fallbackSecret, buildSecretOptions(), currentFallbackSecret(), saveFallbackSecret)
}
