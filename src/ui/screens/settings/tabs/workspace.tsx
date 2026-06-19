import { settings } from '../../../state'
import { persistence } from '@services/storage/persistence.service'
import { appService } from '@services'
import { accountRepo } from '@services/storage/repositories'
import { labeledInput, labeledSelect } from '../shared'

export function buildWorkspacePanel(panel: HTMLElement): void {
  panel.insertAdjacentHTML('beforeend', '<h3>Workspace</h3>')
  const root = labeledInput(panel, 'Code root', 'text', settings.codeRoot, (v) => {
    settings.codeRoot = v.trim()
    persistence.save()
  })
  root.placeholder = '(home)'
  root.style.maxWidth = '280px'

  const ext = labeledInput(
    panel,
    'Code file extensions',
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

  const todo = labeledInput(panel, 'Todo list file', 'text', settings.todoFile, (v) => {
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
  panel.insertAdjacentHTML('beforeend', '<h3 style="margin-top:18px">File explorer</h3>')
  const exRoot = labeledInput(panel, 'Explorer root', 'text', settings.explorerRoot, (v) => {
    settings.explorerRoot = v.trim()
    persistence.save()
  })
  exRoot.style.maxWidth = '280px'
  exRoot.placeholder = '(active terminal cwd)'
  const exExclude = labeledInput(
    panel,
    'Exclude',
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
  panel.insertAdjacentHTML('beforeend', '<h3 style="margin-top:18px">Notifications</h3>')
  const SOUNDS = ['', 'Basso', 'Blow', 'Bottle', 'Frog', 'Funk', 'Glass', 'Hero', 'Morse', 'Ping', 'Pop', 'Purr', 'Sosumi', 'Submarine', 'Tink']
  const sel = (
    <select class="settings-select">
      {SOUNDS.map((s) => {
        const o = (<option>{s || 'Off'}</option>) as HTMLOptionElement
        o.value = s
        if (s === settings.notifSound) o.selected = true
        return o
      })}
    </select>
  ) as HTMLSelectElement
  sel.addEventListener('change', () => {
    settings.notifSound = sel.value
    persistence.save()
    if (sel.value) appService.playSound(sel.value) // preview
  })
  const soundRow = (<div class="settings-row" />) as HTMLDivElement
  soundRow.insertAdjacentHTML('beforeend', '<span class="settings-row-label">Sound</span>')
  soundRow.appendChild(sel)
  panel.appendChild(soundRow)
  panel.insertAdjacentHTML(
    'beforeend',
    '<div class="field-hint">Played when a terminal finishes or Claude needs you. Pick one to preview.</div>'
  )

  // Claude usage — token source for the real `/api/oauth/usage` percentages.
  panel.insertAdjacentHTML('beforeend', '<h3 style="margin-top:18px">Claude usage</h3>')
  panel.insertAdjacentHTML(
    'beforeend',
    '<div class="field-hint">The status-bar chip shows Anthropic\'s real session/week limits, read with the OAuth token Claude Code stores in the macOS keychain. Override the keychain service or point at a saved secret as a fallback.</div>'
  )
  const svc = labeledInput(
    panel,
    'Keychain service',
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
  labeledSelect(panel, 'Fallback secret', secretOptions, current, (v) => {
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
