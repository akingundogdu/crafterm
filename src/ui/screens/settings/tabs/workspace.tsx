import { settings } from '@ui/state/state'
import { UITexts } from '@texts'
import { persistence } from '@repositories/persistence.service'
import { appService , soundService } from '@services'
import { accountRepo } from '@repositories'
import { labeledInput, labeledSelect } from '../shared'

export function buildWorkspacePanel(panel: HTMLElement): void {
  panel.insertAdjacentHTML('beforeend', `<h3>${UITexts.Settings.workspace.heading}</h3>`)
  const root = labeledInput(panel, UITexts.Settings.workspace.codeRoot, 'text', settings.codeRoot, (v) => {
    settings.codeRoot = v.trim()
    persistence.save()
  })
  root.placeholder = '(home)'
  root.style.maxWidth = '280px'

  const shell = labeledInput(panel, UITexts.Settings.workspace.defaultShell, 'text', settings.defaultShell, (v) => {
    settings.defaultShell = v.trim()
    persistence.save()
  })
  shell.placeholder = '($SHELL, then /bin/zsh)'
  shell.style.maxWidth = '280px'

  const ext = labeledInput(
    panel,
    UITexts.Settings.workspace.codeExtensions,
    'text',
    settings.codeExtensions.join(', '),
    (v) => {
      settings.codeExtensions = v
        .split(/[\s,]+/)
        .map((e) => e.replace(/^\./, '').trim().toLowerCase())
        .filter((e) => /^[a-z0-9]+$/.test(e))
      persistence.save()
    }
  )
  ext.style.maxWidth = '280px'
  panel.insertAdjacentHTML(
    'beforeend',
    '<div class="field-hint">Clicking these files in a terminal opens them with <code>ide</code>.</div>'
  )

  const todo = labeledInput(panel, UITexts.Settings.workspace.todoFile, 'text', settings.todoFile, (v) => {
    settings.todoFile = v.trim()
    persistence.save()
  })
  todo.style.maxWidth = '280px'
  todo.placeholder = '~/path/to/todo-list.md'
  panel.insertAdjacentHTML(
    'beforeend',
    '<div class="field-hint">Path to the markdown file shown in the Improve Crafterm panel.</div>'
  )

  // File explorer (right panel → Files)
  panel.insertAdjacentHTML('beforeend', `<h3 style="margin-top:18px">${UITexts.Settings.workspace.fileExplorer}</h3>`)
  const exRoot = labeledInput(panel, UITexts.Settings.workspace.explorerRoot, 'text', settings.explorerRoot, (v) => {
    settings.explorerRoot = v.trim()
    persistence.save()
  })
  exRoot.style.maxWidth = '280px'
  exRoot.placeholder = '(active terminal cwd)'
  const exExclude = labeledInput(
    panel,
    UITexts.Settings.workspace.exclude,
    'text',
    settings.explorerExclude.join(', '),
    (v) => {
      settings.explorerExclude = v
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean)
      persistence.save()
    }
  )
  exExclude.style.maxWidth = '280px'
  panel.insertAdjacentHTML(
    'beforeend',
    '<div class="field-hint">Names hidden in the Files panel (comma-separated). Right-click an item there to exclude it.</div>'
  )

  // Notification sound (macOS system sounds; '' = off)
  panel.insertAdjacentHTML('beforeend', `<h3 style="margin-top:18px">${UITexts.Settings.workspace.notifications}</h3>`)
  const SOUNDS = ['', 'Basso', 'Blow', 'Bottle', 'Frog', 'Funk', 'Glass', 'Hero', 'Morse', 'Ping', 'Pop', 'Purr', 'Sosumi', 'Submarine', 'Tink']
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
  sel.addEventListener('change', () => {
    settings.notifSound = sel.value
    persistence.save()
    if (sel.value) soundService.play(sel.value) // preview
  })
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
    (v) => {
      settings.claudeUsageAuth.keychainService = v.trim() || 'Claude Code-credentials'
      persistence.save()
    }
  )
  svc.style.maxWidth = '260px'
  svc.placeholder = 'Claude Code-credentials'

  // Fallback secret: any secret-typed field stored under Accounts. Value is the
  // (entryId :: fieldKey) pair; the renderer decrypts it at fetch time.
  const secretOptions: [string, string][] = [['', 'None']]
  for (const a of accountRepo.getAll()) {
    for (const f of a.fields ?? []) {
      if (f.secret) secretOptions.push([`${a.id}::${f.key}`, `${a.label} / ${f.key}`])
    }
  }
  const current =
    settings.claudeUsageAuth.fallbackSecretId && settings.claudeUsageAuth.fallbackSecretKey
      ? `${settings.claudeUsageAuth.fallbackSecretId}::${settings.claudeUsageAuth.fallbackSecretKey}`
      : ''
  labeledSelect(panel, UITexts.Settings.workspace.fallbackSecret, secretOptions, current, (v) => {
    if (!v) {
      settings.claudeUsageAuth.fallbackSecretId = ''
      settings.claudeUsageAuth.fallbackSecretKey = ''
    } else {
      const [id, key] = v.split('::')
      settings.claudeUsageAuth.fallbackSecretId = id
      settings.claudeUsageAuth.fallbackSecretKey = key
    }
    persistence.save()
  })
}
