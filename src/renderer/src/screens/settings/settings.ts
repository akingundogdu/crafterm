import { themes } from '../../themes'
import {
  settings,
  state,
  requestSidebar,
  resolveTheme,
  applyBgColor,
  uid
} from '../../state'
import { persistence } from '../../services/storage/persistence.service'
import type { PaletteCommand, ProjectNode, Application, ActionMenuItem, IosDevConfig } from '../../types'
import { BUILTIN_ACTIONS } from '../../types'
import { flattenProjects, removeProject } from '../../catalog'
import { makeProject } from '../../tree'
import { reconcileWorktrees, purgeWorktrees } from '../../services/worktrees'
import { applyAppearance } from '../../pane'
import { ALL_THEME_NAMES, applyTheme } from '../../editor/monaco-setup'
import { applyOrientation, applySidebarFont, applyTabDisplay, tabMeta } from '../../sidebar'
import { pickFolderPath } from '../pickers/pickers'
import { makeCloseButton, promptForm, promptText } from '../../dialog'
import {
  KEYBINDINGS,
  effectiveCombo,
  comboLabel,
  comboFromEvent,
  setBinding,
  resetBinding,
  setRecording,
  isModifierKey
} from '../../keybindings'
import { appService } from '../../services/ipc'
import { paletteCommandRepo, accountRepo, actionMenuRepo, applicationRepo, iosConfigRepo } from '../../services/storage/repositories'

// Quick background presets (black default + a few dark tones); a custom color
// picker covers anything else.
const BG_PRESETS = ['#000000', '#0d1117', '#0d0e12', '#11151c', '#161821', '#1a1b26', '#1e1e2e']

const COLOR_KEYS = [
  'background',
  'foreground',
  'cursor',
  'cursorAccent',
  'selectionBackground',
  'selectionForeground',
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'brightBlack',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightMagenta',
  'brightCyan',
  'brightWhite'
] as const

// Cleanups run when the settings modal closes (e.g. stop shortcut recording).
let settingsCleanups: (() => void)[] = []

function toHex6(v: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v
  if (/^#[0-9a-fA-F]{3}$/.test(v)) return '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3]
  return '#000000'
}

// Render a horizontal sub-tab strip with one body panel shown at a time.
// Each tab's `build` runs once, lazily, the first time its tab is shown.
function buildSubTabs(
  parent: HTMLElement,
  tabs: { label: string; build: (el: HTMLElement) => void }[],
  opts?: { initialIndex?: number; onTabChange?: (idx: number) => void }
): void {
  const bar = document.createElement('div')
  bar.className = 'settings-subtabs'
  const body = document.createElement('div')
  body.className = 'settings-subtab-body'
  parent.append(bar, body)
  const btns: HTMLButtonElement[] = []
  const panels: HTMLElement[] = []
  const built: boolean[] = []
  const show = (i: number): void => {
    btns.forEach((b, j) => b.classList.toggle('active', j === i))
    panels.forEach((p, j) => (p.style.display = j === i ? 'block' : 'none'))
    if (!built[i]) {
      tabs[i].build(panels[i])
      built[i] = true
    }
    opts?.onTabChange?.(i)
  }
  tabs.forEach((t, i) => {
    const b = document.createElement('button')
    b.className = 'settings-subtab'
    b.textContent = t.label
    b.addEventListener('click', () => show(i))
    const p = document.createElement('div')
    p.className = 'settings-subtab-panel'
    p.style.display = 'none'
    btns.push(b)
    panels.push(p)
    built.push(false)
    bar.appendChild(b)
    body.appendChild(p)
  })
  if (tabs.length) {
    const start = opts?.initialIndex ?? 0
    show(start >= 0 && start < tabs.length ? start : 0)
  }
}

function labeledInput(
  parent: HTMLElement,
  label: string,
  type: string,
  value: string,
  onChange: (v: string) => void
): HTMLInputElement {
  const field = document.createElement('div')
  field.className = 'field'
  const lab = document.createElement('label')
  lab.textContent = label
  const input = document.createElement('input')
  input.type = type
  input.value = value
  input.addEventListener('change', () => onChange(input.value))
  field.append(lab, input)
  parent.appendChild(field)
  return input
}

function labeledSelect(
  parent: HTMLElement,
  label: string,
  options: [string, string][],
  selected: string,
  onChange: (v: string) => void
): HTMLSelectElement {
  const field = document.createElement('div')
  field.className = 'field'
  const lab = document.createElement('label')
  lab.textContent = label
  const sel = document.createElement('select')
  options.forEach(([val, text]) => {
    const o = document.createElement('option')
    o.value = val
    o.textContent = text
    if (val === selected) o.selected = true
    sel.appendChild(o)
  })
  sel.addEventListener('change', () => onChange(sel.value))
  field.append(lab, sel)
  parent.appendChild(field)
  return sel
}

// macOS-style settings: category list on the left, the selected panel on the right.
export function openSettings(): void {
  settingsCleanups = []
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  const modal = document.createElement('div')
  modal.className = 'modal settings-modal'
  overlay.appendChild(modal)
  const closeSettings = (): void => {
    settingsCleanups.forEach((fn) => fn())
    overlay.remove()
  }
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) closeSettings()
  })
  modal.appendChild(makeCloseButton(closeSettings))

  const nav = document.createElement('div')
  nav.className = 'settings-nav'
  const body = document.createElement('div')
  body.className = 'settings-body'
  modal.append(nav, body)

  const categories = [
    'Appearance',
    'Theme',
    'Sidebar',
    'Tabs',
    'Workspace',
    'Projects',
    'Commands',
    'Reminders',
    'Action menu',
    'Shortcuts',
    'System update'
  ] as const
  const panels: Record<string, HTMLElement> = {}
  const navButtons: Record<string, HTMLButtonElement> = {}

  const show = (cat: string): void => {
    for (const c of categories) {
      panels[c].style.display = c === cat ? 'block' : 'none'
      navButtons[c].classList.toggle('active', c === cat)
    }
  }

  for (const c of categories) {
    const b = document.createElement('button')
    b.className = 'settings-nav-item'
    b.textContent = c
    b.addEventListener('click', () => show(c))
    nav.appendChild(b)
    navButtons[c] = b
    const p = document.createElement('div')
    p.className = 'settings-panel'
    panels[c] = p
    body.appendChild(p)
  }

  buildAppearancePanel(panels['Appearance'])
  buildThemePanel(panels['Theme'])
  buildSidebarPanel(panels['Sidebar'])
  buildTabsPanel(panels['Tabs'])
  buildWorkspacePanel(panels['Workspace'])
  buildProjectsPanel(panels['Projects'])
  buildCommandsPanel(panels['Commands'])
  buildRemindersPanel(panels['Reminders'])
  buildShortcutsPanel(panels['Shortcuts'])
  buildActionMenuPanel(panels['Action menu'])
  buildSystemUpdatePanel(panels['System update'])

  // Save status footer: shows Unsaved / Saving… / Saved HH:MM:SS + a manual flush.
  const footer = document.createElement('div')
  footer.className = 'settings-save-footer'
  const chip = document.createElement('span')
  chip.className = 'settings-save-chip'
  const saveBtn = document.createElement('button')
  saveBtn.className = 'settings-inline-btn'
  saveBtn.textContent = 'Save now'
  saveBtn.addEventListener('click', () => persistence.flush())
  footer.append(chip, saveBtn)
  modal.appendChild(footer)
  const formatTime = (ms: number): string => {
    const d = new Date(ms)
    const pad = (n: number): string => (n < 10 ? '0' + n : String(n))
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  }
  const refreshChip = (): void => {
    if (persistence.status.pending) {
      chip.textContent = 'Saving…'
      chip.dataset.state = 'pending'
    } else if (persistence.status.lastSavedAt) {
      chip.textContent = `Saved · ${formatTime(persistence.status.lastSavedAt)}`
      chip.dataset.state = 'saved'
    } else {
      chip.textContent = 'No changes yet'
      chip.dataset.state = 'idle'
    }
  }
  refreshChip()
  const unsubscribe = persistence.subscribe(refreshChip)
  settingsCleanups.push(unsubscribe)

  show('Appearance')
  document.body.appendChild(overlay)
}

function buildTabsPanel(panel: HTMLElement): void {
  panel.insertAdjacentHTML('beforeend', '<h3>Tabs</h3>')
  panel.insertAdjacentHTML(
    'beforeend',
    '<div class="field-hint">Controls the sidebar and right-panel tab strips. In icon-only mode, hover a tab to see its name and shortcut.</div>'
  )

  labeledSelect(
    panel,
    'Display',
    [
      ['icon', 'Icon only'],
      ['text', 'Text only'],
      ['both', 'Icon + text']
    ],
    settings.tabDisplay.mode,
    (v) => {
      settings.tabDisplay.mode = v as 'icon' | 'text' | 'both'
      applyTabDisplay()
      persistence.save()
    }
  )

  const renderHideGroup = (strip: 'left' | 'right', title: string): void => {
    panel.insertAdjacentHTML('beforeend', `<div class="settings-subhead">${title}</div>`)
    for (const t of tabMeta().filter((m) => m.strip === strip)) {
      const row = document.createElement('label')
      row.style.display = 'flex'
      row.style.alignItems = 'center'
      row.style.gap = '6px'
      row.style.padding = '2px 0'
      const cb = document.createElement('input')
      cb.type = 'checkbox'
      cb.checked = !settings.tabDisplay.hidden[strip].includes(t.id)
      cb.addEventListener('change', () => {
        const list = settings.tabDisplay.hidden[strip]
        const idx = list.indexOf(t.id)
        if (cb.checked) {
          if (idx >= 0) list.splice(idx, 1)
        } else if (idx < 0) {
          list.push(t.id)
        }
        applyTabDisplay()
        persistence.save()
      })
      row.append(cb, document.createTextNode(' ' + t.label))
      panel.appendChild(row)
    }
  }
  renderHideGroup('left', 'Sidebar tabs (show)')
  renderHideGroup('right', 'Right panel tabs (show)')
}

function buildRemindersPanel(panel: HTMLElement): void {
  panel.insertAdjacentHTML('beforeend', '<h3>Reminders</h3>')

  labeledInput(
    panel,
    'Default hour (for "Tomorrow"-style presets)',
    'number',
    String(settings.reminderDefaults.defaultHour),
    (v) => {
      const n = parseInt(v, 10)
      if (Number.isInteger(n) && n >= 0 && n <= 23) {
        settings.reminderDefaults.defaultHour = n
        persistence.save()
      }
    }
  )

  panel.insertAdjacentHTML('beforeend', '<div class="settings-subhead">Quick-time presets</div>')
  const list = document.createElement('div')
  panel.appendChild(list)

  const renderList = (): void => {
    list.innerHTML = ''
    settings.reminderDefaults.presets.forEach((p, idx) => {
      const card = document.createElement('div')
      card.className = 'app-card'

      const labelI = document.createElement('input')
      labelI.type = 'text'
      labelI.value = p.label
      labelI.placeholder = 'Label'
      labelI.addEventListener('change', () => {
        p.label = labelI.value.trim() || p.label
        labelI.value = p.label
        persistence.save()
      })

      // kind: relative offset (minutes) vs day-based jump
      const kindSel = document.createElement('select')
      kindSel.className = 'settings-select'
      ;[
        ['offset', 'Offset (minutes)'],
        ['days', 'Days ahead']
      ].forEach(([val, text]) => {
        const o = document.createElement('option')
        o.value = val
        o.textContent = text
        kindSel.appendChild(o)
      })
      kindSel.value = typeof p.days === 'number' ? 'days' : 'offset'

      const valueI = document.createElement('input')
      valueI.type = 'number'
      valueI.min = '0'
      valueI.value = String(typeof p.days === 'number' ? p.days : (p.offsetMin ?? 0))

      const snapWrap = document.createElement('label')
      snapWrap.style.display = 'flex'
      snapWrap.style.alignItems = 'center'
      snapWrap.style.gap = '6px'
      const snap = document.createElement('input')
      snap.type = 'checkbox'
      snap.checked = p.snapHour === true
      snapWrap.append(snap, document.createTextNode(' Snap to default hour'))

      const syncSnapVisibility = (): void => {
        snapWrap.style.display = kindSel.value === 'days' ? '' : 'none'
      }
      syncSnapVisibility()

      const applyValue = (): void => {
        const n = Math.max(0, parseInt(valueI.value, 10) || 0)
        if (kindSel.value === 'days') {
          p.days = n
          p.offsetMin = undefined
          p.snapHour = snap.checked ? true : undefined
        } else {
          p.offsetMin = n
          p.days = undefined
          p.snapHour = undefined
        }
        persistence.save()
      }
      kindSel.addEventListener('change', () => {
        syncSnapVisibility()
        applyValue()
      })
      valueI.addEventListener('change', applyValue)
      snap.addEventListener('change', applyValue)

      const del = document.createElement('button')
      del.className = 'app-del'
      del.textContent = '✕'
      del.title = 'Remove preset'
      del.addEventListener('click', () => {
        settings.reminderDefaults.presets.splice(idx, 1)
        persistence.save()
        renderList()
      })

      card.append(labelI, kindSel, valueI, snapWrap, del)
      list.appendChild(card)
    })

    const add = document.createElement('button')
    add.className = 'settings-inline-btn'
    add.textContent = '+ Add preset'
    add.addEventListener('click', () => {
      settings.reminderDefaults.presets.push({ label: '+1h', offsetMin: 60 })
      persistence.save()
      renderList()
    })
    list.appendChild(add)
  }
  renderList()
}

function buildAppearancePanel(panel: HTMLElement): void {
  panel.insertAdjacentHTML('beforeend', '<h3>Appearance</h3>')
  const fam = labeledInput(panel, 'Font family', 'text', settings.font.family, (v) => {
    settings.font.family = v
    applyAppearance()
    persistence.save()
  })
  fam.style.maxWidth = '280px'
  labeledInput(panel, 'Terminal font size', 'number', String(settings.font.size), (v) => {
    const n = parseInt(v, 10)
    if (!Number.isNaN(n) && n >= 6 && n <= 40) {
      settings.font.size = n
      applyAppearance()
      persistence.save()
    }
  })
  buildBackgroundControl(panel)
  labeledSelect(
    panel,
    'Code editor theme',
    ALL_THEME_NAMES.map((n) => [n, n] as [string, string]),
    settings.editorTheme,
    (v) => {
      settings.editorTheme = v
      void applyTheme(v)
      persistence.save()
    }
  )
}

function buildBackgroundControl(panel: HTMLElement): void {
  const field = document.createElement('div')
  field.className = 'field'
  const lab = document.createElement('label')
  lab.textContent = 'Background'

  const row = document.createElement('div')
  row.className = 'bg-swatches'

  const apply = (color: string): void => {
    settings.bgColor = color
    applyBgColor()
    applyAppearance()
    persistence.save()
    mark()
  }

  const swatches: HTMLButtonElement[] = []
  BG_PRESETS.forEach((c) => {
    const s = document.createElement('button')
    s.className = 'bg-swatch'
    s.style.background = c
    s.title = c
    s.addEventListener('click', () => apply(c))
    row.appendChild(s)
    swatches.push(s)
  })

  // free color picker for anything else
  const custom = document.createElement('input')
  custom.type = 'color'
  custom.className = 'bg-custom'
  custom.value = /^#[0-9a-fA-F]{6}$/.test(settings.bgColor) ? settings.bgColor : '#000000'
  custom.title = 'Custom color'
  custom.addEventListener('input', () => apply(custom.value))
  row.appendChild(custom)

  const mark = (): void => {
    swatches.forEach((s, i) => s.classList.toggle('active', BG_PRESETS[i] === settings.bgColor))
  }
  mark()

  field.append(lab, row)
  panel.appendChild(field)
}

function buildThemePanel(panel: HTMLElement): void {
  panel.insertAdjacentHTML('beforeend', '<h3>Theme</h3>')
  const sel = labeledSelect(
    panel,
    'Theme',
    [...Object.keys(themes), 'Custom'].map((n) => [n, n] as [string, string]),
    settings.themeName,
    () => {}
  )

  const copyBtn = document.createElement('button')
  copyBtn.textContent = 'Copy current colors → Custom'
  copyBtn.className = 'settings-inline-btn'
  panel.appendChild(copyBtn)

  const colorWrap = document.createElement('div')
  colorWrap.className = 'color-grid'
  panel.appendChild(colorWrap)

  const renderColors = (): void => {
    colorWrap.replaceChildren()
    const editable = settings.themeName === 'Custom'
    colorWrap.style.opacity = editable ? '1' : '0.4'
    colorWrap.style.pointerEvents = editable ? 'auto' : 'none'
    const src =
      settings.themeName === 'Custom'
        ? settings.customTheme
        : (resolveTheme() as unknown as Record<string, string>)
    COLOR_KEYS.forEach((key) => {
      const val = src[key] || '#000000'
      const rowEl = document.createElement('div')
      rowEl.className = 'color-row'
      const label = document.createElement('label')
      label.textContent = key
      const color = document.createElement('input')
      color.type = 'color'
      color.value = toHex6(val)
      const hex = document.createElement('input')
      hex.type = 'text'
      hex.value = val
      const apply = (v: string): void => {
        settings.customTheme[key] = v
        color.value = toHex6(v)
        hex.value = v
        if (settings.themeName === 'Custom') {
          applyAppearance()
          persistence.save()
        }
      }
      color.addEventListener('input', () => apply(color.value))
      hex.addEventListener('change', () => apply(hex.value))
      rowEl.append(label, color, hex)
      colorWrap.appendChild(rowEl)
    })
  }

  sel.addEventListener('change', () => {
    settings.themeName = sel.value
    applyAppearance()
    persistence.save()
    renderColors()
  })
  copyBtn.addEventListener('click', () => {
    settings.customTheme = { ...(resolveTheme() as unknown as Record<string, string>) }
    settings.themeName = 'Custom'
    sel.value = 'Custom'
    applyAppearance()
    persistence.save()
    renderColors()
  })
  renderColors()
}

function buildShortcutsPanel(panel: HTMLElement): void {
  panel.insertAdjacentHTML('beforeend', '<h3>Shortcuts</h3>')
  panel.insertAdjacentHTML(
    'beforeend',
    '<div class="field-hint">Click a shortcut, then press the new key combo (Cmd required). Esc cancels.</div>'
  )
  const list = document.createElement('div')
  list.className = 'shortcuts-list'
  panel.appendChild(list)

  let recordingId: string | null = null
  let handler: ((e: KeyboardEvent) => void) | null = null

  const stop = (): void => {
    if (handler) window.removeEventListener('keydown', handler, true)
    handler = null
    recordingId = null
    setRecording(false)
  }
  settingsCleanups.push(stop) // stop recording if the modal is closed mid-capture

  const render = (): void => {
    list.replaceChildren()
    KEYBINDINGS.forEach((a) => {
      const row = document.createElement('div')
      row.className = 'shortcut-row'
      const label = document.createElement('span')
      label.className = 'shortcut-label'
      label.textContent = a.label
      const combo = document.createElement('button')
      combo.className = 'shortcut-combo' + (recordingId === a.id ? ' recording' : '')
      combo.textContent = recordingId === a.id ? 'Press keys…' : comboLabel(effectiveCombo(a.id))
      combo.addEventListener('click', () => startRecording(a.id))
      const reset = document.createElement('button')
      reset.className = 'shortcut-reset'
      reset.textContent = '↺'
      reset.title = 'Reset to default'
      if (!settings.bindings[a.id]) reset.style.visibility = 'hidden'
      reset.addEventListener('click', () => {
        resetBinding(a.id)
        persistence.save()
        render()
      })
      row.append(label, combo, reset)
      list.appendChild(row)
    })
  }

  const startRecording = (id: string): void => {
    stop()
    recordingId = id
    setRecording(true)
    render()
    handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        stop()
        render()
        return
      }
      e.preventDefault()
      e.stopPropagation()
      if (isModifierKey(e.key)) return // wait for a real key
      const combo = comboFromEvent(e)
      if (!combo) return // Cmd required
      setBinding(id, combo)
      persistence.save()
      stop()
      render()
    }
    window.addEventListener('keydown', handler, true)
  }

  render()
}

function buildProjectsPanel(panel: HTMLElement): void {
  panel.insertAdjacentHTML('beforeend', '<h3>Projects</h3>')

  const ask = document.createElement('label')
  ask.className = 'checkbox-row'
  const cb = document.createElement('input')
  cb.type = 'checkbox'
  cb.checked = settings.askProjectOnNew
  cb.addEventListener('change', () => {
    settings.askProjectOnNew = cb.checked
    persistence.save()
  })
  ask.append(cb, document.createTextNode('Ask which project to open on a new terminal'))
  panel.appendChild(ask)

  // ---- Global environments (dev/local/production) ----
  panel.insertAdjacentHTML('beforeend', '<div class="settings-subhead">Environments</div>')
  const envBar = document.createElement('div')
  envBar.className = 'env-bar'
  panel.appendChild(envBar)

  // ---- Global workspace groups (used as the Group dropdown) ----
  panel.insertAdjacentHTML('beforeend', '<div class="settings-subhead">Groups (workspaces)</div>')
  const groupBar = document.createElement('div')
  groupBar.className = 'env-bar'
  panel.appendChild(groupBar)

  // ---- Catalog tree (left) + selected-project editor (right) ----
  const md = document.createElement('div')
  md.className = 'projects-md'
  const listCol = document.createElement('div')
  listCol.className = 'projects-md-list'
  const detailCol = document.createElement('div')
  detailCol.className = 'projects-md-detail'
  md.append(listCol, detailCol)
  panel.appendChild(md)

  let selected: ProjectNode | null = flattenProjects(state.tree)[0] ?? null

  // Persist the active sub-tab index per project so re-renders (e.g. after
  // "Add command") don't kick the user back to the first sub-tab.
  const activeSubTabIdx = new Map<string, number>()

  // Union of saved group labels and the ones already in use anywhere in the
  // tree — drives the Group field's datalist so the dropdown stays accurate
  // even before the user touches Settings → Workspace.
  const groupOptions = (): string[] => {
    const used = new Set<string>()
    const walk = (nodes: typeof state.tree): void => {
      for (const n of nodes) {
        if ((n.kind === 'project' || n.kind === 'folder') && n.group) used.add(n.group)
        if (n.kind === 'project' || n.kind === 'folder') walk(n.children)
      }
    }
    walk(state.tree)
    for (const g of settings.groups) used.add(g)
    return [...used].sort((a, b) => a.localeCompare(b))
  }

  // A labeled field (input or textarea) appended to a given parent.
  // Pass `opts.options` to render the input as a datalist-backed combobox
  // (typed value is still free-form; the dropdown just suggests known entries).
  const field = (
    parent: HTMLElement,
    label: string,
    value: string,
    placeholder: string,
    onChange: (v: string) => void,
    opts: { textarea?: boolean; rows?: number; options?: string[] } = {}
  ): void => {
    const wrap = document.createElement('div')
    wrap.className = 'field'
    const lab = document.createElement('label')
    lab.textContent = label
    const input = opts.textarea
      ? document.createElement('textarea')
      : document.createElement('input')
    if (input instanceof HTMLInputElement) input.type = 'text'
    if (input instanceof HTMLTextAreaElement) input.rows = opts.rows ?? 3
    input.value = value
    input.placeholder = placeholder
    input.addEventListener('change', () => onChange(input.value))
    wrap.append(lab, input)
    if (opts.options && input instanceof HTMLInputElement) {
      const listId = 'dl-' + Math.random().toString(36).slice(2, 9)
      input.setAttribute('list', listId)
      const dl = document.createElement('datalist')
      dl.id = listId
      for (const v of opts.options) {
        const o = document.createElement('option')
        o.value = v
        dl.appendChild(o)
      }
      wrap.appendChild(dl)
    }
    parent.appendChild(wrap)
  }

  // A real dropdown field. `options` are the selectable values; the current
  // value is always present (legacy labels stay selectable). The empty option
  // (label `emptyLabel`) clears the value.
  const selectField = (
    parent: HTMLElement,
    label: string,
    value: string,
    emptyLabel: string,
    options: string[],
    onChange: (v: string) => void
  ): void => {
    const wrap = document.createElement('div')
    wrap.className = 'field'
    const lab = document.createElement('label')
    lab.textContent = label
    const sel = document.createElement('select')
    const empty = document.createElement('option')
    empty.value = ''
    empty.textContent = emptyLabel
    sel.appendChild(empty)
    const all = [...new Set([...options, ...(value ? [value] : [])])]
    for (const v of all) {
      const o = document.createElement('option')
      o.value = v
      o.textContent = v
      sel.appendChild(o)
    }
    sel.value = value
    sel.addEventListener('change', () => onChange(sel.value))
    wrap.append(lab, sel)
    parent.appendChild(wrap)
  }

  const renderEnvs = (): void => {
    envBar.replaceChildren()
    settings.environments.forEach((name, i) => {
      const chip = document.createElement('span')
      chip.className = 'env-chip'
      const label = document.createElement('span')
      label.textContent = name
      const x = document.createElement('button')
      x.className = 'env-chip-x'
      x.textContent = '×'
      x.title = 'Remove environment'
      x.addEventListener('click', () => {
        settings.environments.splice(i, 1)
        persistence.save()
        renderEnvs()
        renderDetail()
      })
      chip.append(label, x)
      envBar.appendChild(chip)
    })
    const add = document.createElement('button')
    add.className = 'settings-inline-btn env-add'
    add.textContent = '+ Environment'
    add.addEventListener('click', () => {
      void (async () => {
        const name = await promptText({
          title: 'New environment',
          label: 'Name',
          placeholder: 'staging',
          confirmText: 'Add'
        })
        if (!name || settings.environments.includes(name)) return
        settings.environments.push(name)
        persistence.save()
        renderEnvs()
        renderDetail()
      })()
    })
    envBar.appendChild(add)
  }

  const renderGroups = (): void => {
    groupBar.replaceChildren()
    const known = groupOptions()
    known.forEach((name) => {
      const chip = document.createElement('span')
      chip.className = 'env-chip'
      const label = document.createElement('span')
      label.textContent = name
      const x = document.createElement('button')
      x.className = 'env-chip-x'
      x.textContent = '×'
      x.title = 'Remove group from suggestions (does not unset on existing projects)'
      x.addEventListener('click', () => {
        settings.groups = settings.groups.filter((g) => g !== name)
        persistence.save()
        renderGroups()
        renderDetail()
      })
      chip.append(label, x)
      groupBar.appendChild(chip)
    })
    const add = document.createElement('button')
    add.className = 'settings-inline-btn env-add'
    add.textContent = '+ Group'
    add.addEventListener('click', () => {
      void (async () => {
        const name = await promptText({
          title: 'New group',
          label: 'Name',
          placeholder: 'work',
          confirmText: 'Add'
        })
        const g = (name ?? '').trim()
        if (!g || settings.groups.includes(g)) return
        settings.groups.push(g)
        persistence.save()
        renderGroups()
        renderDetail()
      })()
    })
    groupBar.appendChild(add)
  }

  const renderTree = (): void => {
    listCol.replaceChildren()
    const topProjects = state.tree.filter((n): n is ProjectNode => n.kind === 'project')
    if (!topProjects.length) {
      listCol.insertAdjacentHTML('beforeend', '<div class="field-hint">No projects yet.</div>')
    }
    const renderRows = (projects: ProjectNode[], depth: number): void => {
      projects.forEach((p) => {
        const row = document.createElement('div')
        row.className = 'proj-li' + (p === selected ? ' active' : '')
        row.style.paddingLeft = 8 + depth * 14 + 'px'
        const name = document.createElement('span')
        name.className = 'proj-li-name'
        name.textContent = p.name || '(untitled)'
        row.append(name)
        if (p.group) {
          const g = document.createElement('span')
          g.className = 'proj-li-group'
          g.textContent = p.group
          row.append(g)
        }
        if (p.apps?.length) {
          const a = document.createElement('span')
          a.className = 'proj-li-apps'
          a.textContent = p.apps.length === 1 ? '1 app' : `${p.apps.length} apps`
          row.append(a)
        }
        row.addEventListener('click', () => {
          selected = p
          renderTree()
          renderDetail()
        })
        listCol.appendChild(row)
        const subProjects = p.children.filter((c): c is ProjectNode => c.kind === 'project')
        if (subProjects.length) renderRows(subProjects, depth + 1)
      })
    }
    renderRows(topProjects, 0)

    const addBtn = document.createElement('button')
    addBtn.className = 'settings-inline-btn'
    addBtn.textContent = '+ Add project'
    addBtn.addEventListener('click', () => {
      const proj = makeProject(uid('p'), 'New project', '')
      state.tree.push(proj)
      selected = proj
      persistence.save()
      requestSidebar()
      renderTree()
      renderDetail()
    })
    listCol.appendChild(addBtn)
  }

  // The Applications section of the selected project's editor.
  const renderApps = (p: ProjectNode, parent: HTMLElement): void => {
    parent.insertAdjacentHTML('beforeend', '<div class="settings-subhead">Applications</div>')
    if (!applicationRepo.listForProject(p.id).length) {
      parent.insertAdjacentHTML(
        'beforeend',
        '<div class="field-hint">No applications. Add one to run it (with per-environment commands).</div>'
      )
    }
    applicationRepo.listForProject(p.id).forEach((app) => {
      const card = document.createElement('div')
      card.className = 'app-card'
      const head = document.createElement('div')
      head.className = 'app-card-head'
      const title = document.createElement('span')
      title.className = 'app-card-title'
      title.textContent = app.name || '(unnamed app)'
      const delApp = document.createElement('button')
      delApp.className = 'app-del'
      delApp.textContent = '✕'
      delApp.title = 'Remove application'
      delApp.addEventListener('click', () => {
        applicationRepo.remove(p.id, app.id)
        renderTree()
        renderDetail()
      })
      head.append(title, delApp)
      card.appendChild(head)

      field(card, 'Name', app.name, 'backend', (v) => {
        app.name = v.trim()
        title.textContent = app.name || '(unnamed app)'
        renderTree()
        applicationRepo.upsert(p.id, app)
      })
      field(card, 'Path', app.path ?? '', 'relative to project, or absolute (optional)', (v) => {
        app.path = v.trim() || undefined
        applicationRepo.upsert(p.id, app)
      })

      const opensWrap = document.createElement('div')
      opensWrap.className = 'field'
      const opensLab = document.createElement('label')
      opensLab.textContent = 'Opens as'
      const opensSel = document.createElement('select')
      opensSel.className = 'settings-select'
      ;[
        ['split', 'Split (tiled tab)'],
        ['tab', 'Separate tab']
      ].forEach(([v, lbl]) => {
        const o = document.createElement('option')
        o.value = v
        o.textContent = lbl
        if ((app.opensAs ?? 'split') === v) o.selected = true
        opensSel.appendChild(o)
      })
      opensSel.addEventListener('change', () => {
        app.opensAs = opensSel.value as Application['opensAs']
        applicationRepo.upsert(p.id, app)
      })
      opensWrap.append(opensLab, opensSel)
      card.appendChild(opensWrap)

      // one command field per environment
      card.insertAdjacentHTML('beforeend', '<div class="app-cmd-head">Commands per environment</div>')
      app.commands = app.commands ?? {}
      for (const envName of settings.environments) {
        field(card, envName, app.commands[envName] ?? '', `command for ${envName}`, (v) => {
          const t = v.trim()
          if (t) app.commands[envName] = t
          else delete app.commands[envName]
          applicationRepo.upsert(p.id, app)
        })
      }

      // Optional named menu commands surfaced in the pane action menu of any
      // terminal spawned from this application.
      card.insertAdjacentHTML('beforeend', '<div class="app-cmd-head">Run commands</div>')
      app.runCommands = app.runCommands ?? []
      app.runCommands.forEach((rc) => {
        const row = document.createElement('div')
        row.className = 'app-rc-row'
        const nameI = document.createElement('input')
        nameI.type = 'text'
        nameI.value = rc.name
        nameI.placeholder = 'name'
        nameI.addEventListener('change', () => {
          rc.name = nameI.value.trim() || rc.name
          applicationRepo.upsert(p.id, app)
        })
        nameI.addEventListener('keydown', (e) => e.stopPropagation())
        const cmdI = document.createElement('input')
        cmdI.type = 'text'
        cmdI.value = rc.command
        cmdI.placeholder = 'shell command'
        cmdI.addEventListener('change', () => {
          rc.command = cmdI.value.trim()
          applicationRepo.upsert(p.id, app)
        })
        cmdI.addEventListener('keydown', (e) => e.stopPropagation())
        const delRc = document.createElement('button')
        delRc.className = 'app-del'
        delRc.textContent = '✕'
        delRc.title = 'Remove command'
        delRc.addEventListener('click', () => {
          app.runCommands = (app.runCommands ?? []).filter((x) => x !== rc)
          applicationRepo.upsert(p.id, app)
          renderDetail()
        })
        row.append(nameI, cmdI, delRc)
        card.appendChild(row)
      })
      const addRc = document.createElement('button')
      addRc.className = 'settings-inline-btn app-rc-add'
      addRc.textContent = '+ Add run command'
      addRc.addEventListener('click', () => {
        app.runCommands = app.runCommands ?? []
        app.runCommands.push({ id: uid('rc'), name: 'command', command: '' })
        applicationRepo.upsert(p.id, app)
        renderDetail()
      })
      card.appendChild(addRc)

      parent.appendChild(card)
    })

    const addApp = document.createElement('button')
    addApp.className = 'settings-inline-btn'
    addApp.textContent = '+ Add application'
    addApp.addEventListener('click', () => {
      applicationRepo.upsert(p.id, { id: uid('app'), name: 'app', commands: {} })
      renderTree()
      renderDetail()
    })
    parent.appendChild(addApp)
  }

  // The Features section: time-tracking labels under this project (used by
  // the Time tracker dropdown). Just name + delete; the data also drives the
  // sidebar "New feature…" wizard.
  const renderFeatures = (p: ProjectNode, parent: HTMLElement): void => {
    parent.insertAdjacentHTML('beforeend', '<div class="settings-subhead">Features</div>')
    p.features = p.features ?? []
    if (!p.features.length) {
      parent.insertAdjacentHTML(
        'beforeend',
        '<div class="field-hint">No features. Add labels to track time against, or for the New-feature wizard.</div>'
      )
    }
    p.features.forEach((feat) => {
      const row = document.createElement('div')
      row.className = 'feat-row'
      const input = document.createElement('input')
      input.type = 'text'
      input.value = feat.name
      input.placeholder = 'feature name'
      input.addEventListener('change', () => {
        feat.name = input.value.trim() || feat.name
        persistence.save()
      })
      input.addEventListener('keydown', (e) => e.stopPropagation())
      const del = document.createElement('button')
      del.className = 'feat-del'
      del.textContent = '✕'
      del.title = 'Remove feature'
      del.addEventListener('click', () => {
        p.features = (p.features ?? []).filter((f) => f !== feat)
        persistence.save()
        renderTree()
        renderDetail()
      })
      row.append(input, del)
      parent.appendChild(row)
    })

    const add = document.createElement('button')
    add.className = 'settings-inline-btn'
    add.textContent = '+ Add feature'
    add.addEventListener('click', () => {
      p.features = p.features ?? []
      p.features.push({ id: uid('ft'), name: 'feature' })
      persistence.save()
      renderDetail()
    })
    parent.appendChild(add)
  }

  // Run commands: named one-shot shell commands. Surfaced in the sidebar
  // "Run command…" modal and executed at the project path (split or new tab).
  const renderRunCommands = (p: ProjectNode, parent: HTMLElement): void => {
    parent.insertAdjacentHTML('beforeend', '<div class="settings-subhead">Run commands</div>')
    p.runCommands = p.runCommands ?? []
    if (!p.runCommands.length) {
      parent.insertAdjacentHTML(
        'beforeend',
        '<div class="field-hint">No run commands. Add named shell commands (e.g. "Deploy", "Lint") that you can fire from the sidebar.</div>'
      )
    }
    p.runCommands.forEach((rc) => {
      const card = document.createElement('div')
      card.className = 'app-card'
      const head = document.createElement('div')
      head.className = 'app-card-head'
      const title = document.createElement('span')
      title.className = 'app-card-title'
      title.textContent = rc.name || '(unnamed command)'
      const del = document.createElement('button')
      del.className = 'app-del'
      del.textContent = '✕'
      del.title = 'Remove command'
      del.addEventListener('click', () => {
        p.runCommands = (p.runCommands ?? []).filter((x) => x !== rc)
        persistence.save()
        renderDetail()
      })
      head.append(title, del)
      card.appendChild(head)
      field(card, 'Name', rc.name, 'Deploy', (v) => {
        rc.name = v.trim() || rc.name
        title.textContent = rc.name || '(unnamed command)'
        persistence.save()
      })
      field(card, 'Command', rc.command, 'npm run deploy', (v) => {
        rc.command = v.trim()
        persistence.save()
      })
      parent.appendChild(card)
    })
    const add = document.createElement('button')
    add.className = 'settings-inline-btn'
    add.textContent = '+ Add command'
    add.addEventListener('click', () => {
      p.runCommands = p.runCommands ?? []
      p.runCommands.push({ id: uid('rc'), name: 'command', command: '' })
      persistence.save()
      renderDetail()
    })
    parent.appendChild(add)
  }

  const renderDetail = (): void => {
    detailCol.replaceChildren()
    const p = selected
    if (!p) {
      detailCol.insertAdjacentHTML(
        'beforeend',
        '<div class="field-hint">Select a project on the left, or add one.</div>'
      )
      return
    }
    const subTabKey = p.id
    buildSubTabs(detailCol, [
      {
        label: 'General',
        build: (el) => {
          field(el, 'Name', p.name, 'Movve', (v) => {
            p.name = v.trim()
            renderTree()
            requestSidebar()
            persistence.save()
          })
          field(el, 'Path', p.path, '~/code/movve', (v) => {
            p.path = v.trim()
            requestSidebar()
            persistence.save()
          })
          selectField(
            el,
            'Group (workspace)',
            p.group ?? '',
            '(Ungrouped)',
            groupOptions(),
            (v) => {
              const g = v.trim()
              p.group = g || undefined
              if (g && !settings.groups.includes(g)) settings.groups.push(g)
              renderTree()
              renderGroups()
              requestSidebar()
              persistence.save()
            }
          )
          field(el, 'Command', p.command ?? '', 'claude (run on open, optional)', (v) => {
            p.command = v.trim() || undefined
            persistence.save()
          })
          field(
            el,
            'Startup command',
            p.startup ?? '',
            'run in every terminal opened inside (optional)',
            (v) => {
              p.startup = v.trim() || undefined
              persistence.save()
            }
          )
          field(el, 'Shell', p.shell ?? '', '/bin/zsh (override, optional)', (v) => {
            p.shell = v.trim() || undefined
            persistence.save()
          })
          field(
            el,
            'Issue key prefix',
            p.issueKeyPrefix ?? '',
            'CRF (for CRF-12 task keys, optional)',
            (v) => {
              p.issueKeyPrefix = v.trim().toUpperCase() || undefined
              persistence.save()
            }
          )
          // Support worktrees: auto-list this repo's git worktrees as folder
          // nodes under the project (terminals nest inside each worktree).
          const wtField = document.createElement('div')
          wtField.className = 'field'
          const wtLabel = document.createElement('label')
          wtLabel.style.cursor = 'pointer'
          const wtCb = document.createElement('input')
          wtCb.type = 'checkbox'
          wtCb.checked = !!p.supportWorktree
          wtCb.style.marginRight = '8px'
          const wtText = document.createElement('span')
          wtText.textContent = 'Support worktrees (list git worktrees as folders)'
          wtLabel.append(wtCb, wtText)
          wtField.appendChild(wtLabel)
          el.appendChild(wtField)
          wtCb.addEventListener('change', () => {
            p.supportWorktree = wtCb.checked
            persistence.save()
            requestSidebar()
            if (p.supportWorktree) void reconcileWorktrees()
            else purgeWorktrees(p)
          })
        }
      },
      {
        label: 'Environment',
        build: (el) => {
          field(
            el,
            'Environment vars',
            p.env ?? '',
            'KEY=VALUE (one per line, optional)',
            (v) => {
              p.env = v.trim() || undefined
              persistence.save()
            },
            { textarea: true, rows: 4 }
          )
        }
      },
      { label: 'Apps', build: (el) => renderApps(p, el) },
      { label: 'Features', build: (el) => renderFeatures(p, el) },
      { label: 'Run commands', build: (el) => renderRunCommands(p, el) },
      { label: 'iOS', build: (el) => renderIosConfig(p, el) }
    ], {
      initialIndex: activeSubTabIdx.get(subTabKey) ?? 0,
      onTabChange: (i) => activeSubTabIdx.set(subTabKey, i)
    })

    const actions = document.createElement('div')
    actions.className = 'proj-detail-actions'
    const addSub = document.createElement('button')
    addSub.className = 'settings-inline-btn'
    addSub.textContent = '+ Add sub-project'
    addSub.addEventListener('click', () => {
      const child = makeProject(uid('p'), 'New sub-project', '')
      p.children.push(child)
      selected = child
      persistence.save()
      requestSidebar()
      renderTree()
      renderDetail()
    })
    const del = document.createElement('button')
    del.className = 'settings-inline-btn project-del-btn'
    del.textContent = 'Delete project'
    del.addEventListener('click', () => {
      removeProject(state.tree, p)
      selected = flattenProjects(state.tree)[0] ?? null
      persistence.save()
      requestSidebar()
      renderTree()
      renderDetail()
    })
    actions.append(addSub, del)
    detailCol.appendChild(actions)
  }

  renderEnvs()
  renderGroups()
  renderTree()
  renderDetail()
}

function buildCommandsPanel(panel: HTMLElement): void {
  panel.insertAdjacentHTML('beforeend', '<h3>Commands</h3>')
  buildSubTabs(panel, [
    {
      label: 'General',
      build: (el) => {
        const ide = labeledInput(el, 'Open code file (ide)', 'text', settings.commands.ide, (v) => {
          settings.commands.ide = v.trim() || 'ide'
          persistence.save()
        })
        ide.style.maxWidth = '280px'
        const zsh = labeledInput(el, 'Update zsh config', 'text', settings.commands.openMyZsh, (v) => {
          settings.commands.openMyZsh = v.trim() || 'openmyzsh'
          persistence.save()
        })
        zsh.style.maxWidth = '280px'
        el.insertAdjacentHTML(
          'beforeend',
          '<div class="field-hint">Shell commands run in a new terminal.</div>'
        )
      }
    },
    { label: 'Markdown folders', build: (el) => buildMarkdownFoldersControl(el) },
    { label: 'Command palette', build: (el) => buildPaletteCommandsControl(el) }
  ])
}

// Per-project iOS worktree config (Settings → Projects → [project] → iOS). The
// repo root is the project's own path. Every field is optional: empty values are
// auto-detected by the bundled ios-worktree.sh, so each iOS project is independent.
function defaultIosConfig(): IosDevConfig {
  return {
    project: '',
    scheme: '',
    baseBundleId: '',
    displayPrefix: '',
    defaultSimulator: '',
    copyFiles: [],
    worktreesDir: ''
  }
}

function renderIosConfig(p: ProjectNode, panel: HTMLElement): void {
  panel.replaceChildren()

  // "iOS app" toggle: reveals the config + the sidebar worktree manager.
  const toggleField = document.createElement('div')
  toggleField.className = 'field'
  const toggleLabel = document.createElement('label')
  toggleLabel.style.cursor = 'pointer'
  const checkbox = document.createElement('input')
  checkbox.type = 'checkbox'
  checkbox.checked = !!p.iosApp
  checkbox.style.marginRight = '8px'
  const labelText = document.createElement('span')
  labelText.textContent = 'iOS app (show the worktree manager under this project)'
  toggleLabel.append(checkbox, labelText)
  toggleField.appendChild(toggleLabel)
  panel.appendChild(toggleField)

  const body = document.createElement('div')
  panel.appendChild(body)

  const renderBody = (): void => {
    body.replaceChildren()
    if (!p.iosApp) {
      body.insertAdjacentHTML(
        'beforeend',
        '<div class="field-hint">Enable to manage this app’s git worktrees (build / run / status) from the sidebar.</div>'
      )
      return
    }
    if (!p.iosConfig) p.iosConfig = defaultIosConfig()
    const cfg = p.iosConfig

    // Repo root = the project's working directory. Editing it here also updates
    // the project path (so worktrees, build/run, and cmd+T all use this repo).
    const repoInput = labeledInput(body, 'iOS repo path', 'text', p.path, (v) => {
      p.path = v.trim()
      persistence.save()
      requestSidebar()
    })
    repoInput.placeholder = '/Users/you/path/to/your-ios-repo'
    repoInput.style.maxWidth = '420px'
    if (!p.path) {
      body.insertAdjacentHTML(
        'beforeend',
        '<div class="field-hint" style="color:var(--amber,#e0a44a)">Required: set this to the iOS app’s git repository.</div>'
      )
    }

    body.insertAdjacentHTML(
      'beforeend',
      '<div class="field-hint">The fields below auto-detect from the Xcode project when left empty.</div>'
    )
    const field = (
      label: string,
      key: 'project' | 'scheme' | 'baseBundleId' | 'displayPrefix' | 'defaultSimulator' | 'worktreesDir',
      placeholder: string
    ): void => {
      const input = labeledInput(body, label, 'text', cfg[key], (v) => {
        cfg[key] = v.trim()
        iosConfigRepo.set(p.id, cfg)
      })
      input.placeholder = placeholder
      input.style.maxWidth = '420px'
    }
    field('Xcode project / workspace', 'project', 'auto: discovered (.xcworkspace/.xcodeproj)')
    field('Scheme', 'scheme', 'auto: xcodebuild -list')
    field('Base bundle identifier', 'baseBundleId', 'auto: from build settings, e.g. com.acme.app')
    field('Display name prefix', 'displayPrefix', 'auto: scheme name')
    field('Default simulator', 'defaultSimulator', 'auto: booted, else first iPhone')
    field('Worktrees directory', 'worktreesDir', 'auto: <repo parent>/worktrees')

    // Files-to-copy list: gitignored local files seeded into a fresh worktree.
    body.insertAdjacentHTML(
      'beforeend',
      '<div class="field" style="margin-top:14px"><label>Copy into new worktrees</label></div>'
    )
    body.insertAdjacentHTML(
      'beforeend',
      '<div class="field-hint">Gitignored local files (paths relative to the repo root) copied from the main checkout, e.g. Secrets.xcconfig.</div>'
    )
    const addBtn = document.createElement('button')
    addBtn.className = 'settings-inline-btn'
    addBtn.textContent = '+ Add file'
    body.appendChild(addBtn)
    const list = document.createElement('div')
    list.className = 'palette-admin-list'
    body.appendChild(list)

    const renderFiles = (): void => {
      list.replaceChildren()
      if (!cfg.copyFiles.length) {
        list.insertAdjacentHTML('beforeend', '<div class="field-hint">No files yet.</div>')
        return
      }
      cfg.copyFiles.forEach((rel, i) => {
        const row = document.createElement('div')
        row.className = 'palette-admin-row'
        const txt = document.createElement('span')
        txt.className = 'palette-admin-cmd'
        txt.textContent = rel
        const del = document.createElement('button')
        del.className = 'wt-act wt-remove'
        del.textContent = 'Delete'
        del.addEventListener('click', () => {
          cfg.copyFiles.splice(i, 1)
          iosConfigRepo.set(p.id, cfg)
          renderFiles()
        })
        row.append(txt, del)
        list.appendChild(row)
      })
    }
    addBtn.addEventListener('click', () => {
      void promptForm({
        title: 'Add file to copy',
        fields: [{ key: 'path', label: 'Path (relative to repo root)', placeholder: 'Secrets.xcconfig' }],
        confirmText: 'Add'
      }).then((values) => {
        const rel = (values?.path || '').trim()
        if (!rel || cfg.copyFiles.includes(rel)) return
        cfg.copyFiles.push(rel)
        iosConfigRepo.set(p.id, cfg)
        renderFiles()
      })
    })
    renderFiles()
  }

  checkbox.addEventListener('change', () => {
    p.iosApp = checkbox.checked
    if (p.iosApp) {
      iosConfigRepo.ensure(p.id, defaultIosConfig)
      p.supportWorktree = true // iOS needs the worktree nodes to attach to
      void reconcileWorktrees()
    }
    persistence.save()
    requestSidebar()
    renderBody()
  })
  renderBody()
}

// Manage the Cmd+Shift+P palette entries (predefined + git/linux cheatsheets).
function buildPaletteCommandsControl(panel: HTMLElement): void {
  panel.insertAdjacentHTML('beforeend', '<h3 style="margin-top:20px">Command palette</h3>')
  panel.insertAdjacentHTML(
    'beforeend',
    '<div class="field-hint">Entries shown in Cmd+Shift+P under category chips. Selecting one types it into the active terminal (without running it).</div>'
  )

  const addBtn = document.createElement('button')
  addBtn.className = 'settings-inline-btn'
  addBtn.textContent = '+ Add command'
  panel.appendChild(addBtn)

  const list = document.createElement('div')
  list.className = 'palette-admin-list'
  panel.appendChild(list)

  const render = (): void => {
    list.replaceChildren()
    const cmds = paletteCommandRepo.getAll()
    if (!cmds.length) {
      list.insertAdjacentHTML('beforeend', '<div class="field-hint">No commands yet.</div>')
      return
    }
    const cats: string[] = []
    for (const c of cmds) if (!cats.includes(c.category)) cats.push(c.category)
    cats.sort((a, b) => a.localeCompare(b))
    cats.forEach((cat) => {
      const head = document.createElement('div')
      head.className = 'palette-admin-cat'
      head.textContent = cat
      list.appendChild(head)
      cmds
        .filter((c) => c.category === cat)
        .forEach((c) => {
          const row = document.createElement('div')
          row.className = 'palette-admin-row'
          const txt = document.createElement('div')
          txt.className = 'palette-admin-text'
          const nm = document.createElement('span')
          nm.className = 'palette-admin-name'
          nm.textContent = c.name
          const cmd = document.createElement('span')
          cmd.className = 'palette-admin-cmd'
          cmd.textContent = c.command
          txt.append(nm, cmd)
          const edit = document.createElement('button')
          edit.className = 'wt-act'
          edit.textContent = 'Edit'
          edit.addEventListener('click', () => void editPaletteCommand(c).then(render))
          const del = document.createElement('button')
          del.className = 'wt-act wt-remove'
          del.textContent = 'Delete'
          del.addEventListener('click', () => {
            paletteCommandRepo.remove(c.id)
            render()
          })
          row.append(txt, edit, del)
          list.appendChild(row)
        })
    })
  }
  addBtn.addEventListener('click', () => void editPaletteCommand().then(render))
  render()
}

// Add or edit one palette command via the shared form modal.
async function editPaletteCommand(existing?: PaletteCommand): Promise<void> {
  const values = await promptForm({
    title: existing ? 'Edit command' : 'New command',
    fields: [
      { key: 'category', label: 'Category', value: existing?.category, placeholder: 'predefined, git, linux…' },
      { key: 'name', label: 'Name', value: existing?.name, placeholder: 'short label' },
      { key: 'command', label: 'Command', value: existing?.command, placeholder: 'git status' }
    ],
    confirmText: existing ? 'Save' : 'Add'
  })
  if (!values) return // cancelled, or category (required first field) left empty
  const command = (values.command || '').trim()
  if (!command) return
  const cmd: PaletteCommand = {
    id: existing?.id ?? uid('pc'),
    category: (values.category || '').trim().toLowerCase() || 'predefined',
    name: (values.name || '').trim() || command,
    command
  }
  paletteCommandRepo.upsert(cmd)
}

// Folders shown as filter chips in the Cmd+O markdown finder. Picked via the
// folder browser; only these folders are listed (and searched) there.
function buildMarkdownFoldersControl(panel: HTMLElement): void {
  panel.insertAdjacentHTML('beforeend', '<h3>Markdown folders</h3>')
  panel.insertAdjacentHTML(
    'beforeend',
    '<div class="field-hint">These folders become the filter chips in the Cmd+O markdown finder.</div>'
  )

  const list = document.createElement('div')
  list.className = 'projects-editor'
  panel.appendChild(list)

  const addBtn = document.createElement('button')
  addBtn.className = 'settings-inline-btn'
  addBtn.textContent = '+ Add folder'
  panel.appendChild(addBtn)

  const pretty = (p: string): string => p.replace(/^\/Users\/[^/]+/, '~')

  const render = (): void => {
    list.replaceChildren()
    if (!settings.commands.mdFolders.length) {
      list.insertAdjacentHTML('beforeend', '<div class="field-hint">No folders yet.</div>')
    }
    settings.commands.mdFolders.forEach((path, idx) => {
      const row = document.createElement('div')
      row.className = 'project-edit-row'
      const label = document.createElement('span')
      label.className = 'mdfolder-path'
      label.textContent = pretty(path)
      label.title = path
      const del = document.createElement('button')
      del.className = 'project-del'
      del.textContent = '✕'
      del.title = 'Remove'
      del.addEventListener('click', () => {
        settings.commands.mdFolders.splice(idx, 1)
        persistence.save()
        render()
      })
      row.append(label, del)
      list.appendChild(row)
    })
  }

  addBtn.addEventListener('click', async () => {
    const picked = await pickFolderPath()
    if (!picked) return
    if (!settings.commands.mdFolders.includes(picked)) {
      settings.commands.mdFolders.push(picked)
      persistence.save()
      render()
    }
  })
  render()
}

function buildWorkspacePanel(panel: HTMLElement): void {
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
  const soundRow = document.createElement('div')
  soundRow.className = 'settings-row'
  soundRow.insertAdjacentHTML('beforeend', '<span class="settings-row-label">Sound</span>')
  const sel = document.createElement('select')
  sel.className = 'settings-select'
  for (const s of SOUNDS) {
    const o = document.createElement('option')
    o.value = s
    o.textContent = s || 'Off'
    if (s === settings.notifSound) o.selected = true
    sel.appendChild(o)
  }
  sel.addEventListener('change', () => {
    settings.notifSound = sel.value
    persistence.save()
    if (sel.value) appService.playSound(sel.value) // preview
  })
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

function buildSidebarPanel(panel: HTMLElement): void {
  panel.insertAdjacentHTML('beforeend', '<h3>Sidebar</h3>')
  labeledSelect(
    panel,
    'Position',
    [
      ['left', 'Vertical (left)'],
      ['top', 'Horizontal (top)']
    ],
    settings.sidebar.orientation,
    (v) => {
      settings.sidebar.orientation = v as 'left' | 'top'
      applyOrientation()
      persistence.save()
    }
  )
  labeledInput(panel, 'Sidebar font size', 'number', String(settings.sidebar.fontSize), (v) => {
    const n = parseInt(v, 10)
    if (!Number.isNaN(n) && n >= 9 && n <= 22) {
      settings.sidebar.fontSize = n
      applySidebarFont()
      persistence.save()
    }
  })

  const detailDefs: Array<[keyof typeof settings.sidebar.details, string]> = [
    ['status', 'Show status text'],
    ['git', 'Show git branch'],
    ['panes', 'Show pane count'],
    ['paneList', 'Show panes under terminal']
  ]
  detailDefs.forEach(([key, label]) => {
    const r = document.createElement('label')
    r.className = 'checkbox-row'
    const cb = document.createElement('input')
    cb.type = 'checkbox'
    cb.checked = settings.sidebar.details[key]
    cb.addEventListener('change', () => {
      settings.sidebar.details[key] = cb.checked
      requestSidebar()
      persistence.save()
    })
    r.append(cb, document.createTextNode(label))
    panel.appendChild(r)
  })

  const recRow = document.createElement('label')
  recRow.className = 'checkbox-row'
  const recCb = document.createElement('input')
  recCb.type = 'checkbox'
  recCb.checked = !!settings.sidebar.groupByRecency
  recCb.addEventListener('change', () => {
    settings.sidebar.groupByRecency = recCb.checked
    requestSidebar()
    persistence.save()
  })
  recRow.append(recCb, document.createTextNode('Group by recency (Today / Yesterday / Earlier)'))
  panel.appendChild(recRow)
}

function buildActionMenuPanel(panel: HTMLElement): void {
  panel.insertAdjacentHTML('beforeend', '<h3>Action menu</h3>')
  panel.insertAdjacentHTML(
    'beforeend',
    '<div class="field-hint">Rows shown in the sidebar ⋯ menu. Builtin rows trigger an in-app action; command rows run a shell command (split beside the active pane, or a new tab). Reorder, hide, edit, or add your own.</div>'
  )

  const list = document.createElement('div')
  list.className = 'action-menu-admin'
  panel.appendChild(list)

  const builtinLabel = (id?: string): string =>
    BUILTIN_ACTIONS.find((a) => a.id === id)?.label ?? '(unknown builtin)'

  const move = (i: number, delta: number): void => {
    const arr = actionMenuRepo.getAll()
    const j = i + delta
    if (j < 0 || j >= arr.length) return
    // Positional swap — ordering isn't expressible through the CRUD repo, so the
    // physical array is reordered in place and persisted directly.
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
    persistence.save()
    render()
  }

  const render = (): void => {
    list.replaceChildren()
    if (!actionMenuRepo.getAll().length) {
      list.insertAdjacentHTML('beforeend', '<div class="field-hint">No items.</div>')
    }
    actionMenuRepo.getAll().forEach((item, i) => {
      const row = document.createElement('div')
      row.className = 'action-menu-row' + (item.hidden ? ' hidden' : '')

      const up = document.createElement('button')
      up.className = 'wt-act'
      up.textContent = '↑'
      up.disabled = i === 0
      up.addEventListener('click', () => move(i, -1))
      const down = document.createElement('button')
      down.className = 'wt-act'
      down.textContent = '↓'
      down.disabled = i === actionMenuRepo.getAll().length - 1
      down.addEventListener('click', () => move(i, 1))

      const txt = document.createElement('div')
      txt.className = 'action-menu-text'
      const nm = document.createElement('span')
      nm.className = 'action-menu-name'
      nm.textContent = item.title
      const sub = document.createElement('span')
      sub.className = 'action-menu-sub'
      sub.textContent =
        item.kind === 'builtin'
          ? `builtin · ${builtinLabel(item.builtinId)}`
          : `command (${item.opensAs ?? 'tab'}) · ${item.command || '—'}`
      txt.append(nm, sub)

      const hideBtn = document.createElement('button')
      hideBtn.className = 'wt-act'
      hideBtn.textContent = item.hidden ? 'Show' : 'Hide'
      hideBtn.addEventListener('click', () => {
        item.hidden = !item.hidden
        actionMenuRepo.upsert(item)
        render()
      })
      const edit = document.createElement('button')
      edit.className = 'wt-act'
      edit.textContent = 'Edit'
      edit.addEventListener('click', () => void editActionItem(item).then(render))
      const del = document.createElement('button')
      del.className = 'wt-act wt-remove'
      del.textContent = 'Delete'
      del.addEventListener('click', () => {
        actionMenuRepo.remove(item.id)
        render()
      })

      row.append(up, down, txt, hideBtn, edit, del)
      list.appendChild(row)
    })
  }

  const actions = document.createElement('div')
  actions.className = 'proj-detail-actions'
  const addCmd = document.createElement('button')
  addCmd.className = 'settings-inline-btn'
  addCmd.textContent = '+ Add command'
  addCmd.addEventListener('click', () => {
    void editActionItem().then((added) => {
      if (added) {
        actionMenuRepo.upsert(added)
        render()
      }
    })
  })
  const reset = document.createElement('button')
  reset.className = 'settings-inline-btn'
  reset.textContent = 'Reset to defaults'
  reset.addEventListener('click', () => {
    settings.actionMenu = BUILTIN_ACTIONS.map((a) => ({
      id: uid('am'),
      title: a.label,
      kind: 'builtin' as const,
      builtinId: a.id
    }))
    persistence.save()
    render()
  })
  actions.append(addCmd, reset)
  panel.appendChild(actions)

  render()
}

// Edit an existing action item in place (returns null), or create a new command
// item (returns it). Builtin items only allow renaming; command items get a
// command + placement.
async function editActionItem(existing?: ActionMenuItem): Promise<ActionMenuItem | null> {
  const isBuiltin = existing?.kind === 'builtin'
  const values = await promptForm({
    title: existing ? 'Edit action' : 'New command action',
    fields: isBuiltin
      ? [{ key: 'title', label: 'Title', value: existing?.title, placeholder: 'menu label' }]
      : [
          { key: 'title', label: 'Title', value: existing?.title, placeholder: 'Deploy' },
          { key: 'command', label: 'Command', value: existing?.command, placeholder: 'npm run deploy' },
          { key: 'opensAs', label: 'Opens as (split/tab)', value: existing?.opensAs ?? 'tab', placeholder: 'tab' }
        ],
    confirmText: existing ? 'Save' : 'Add'
  })
  if (!values) return null
  const title = (values.title || '').trim()
  if (!title) return null
  if (existing) {
    existing.title = title
    if (!isBuiltin) {
      existing.command = (values.command || '').trim()
      existing.opensAs = (values.opensAs || '').trim() === 'split' ? 'split' : 'tab'
    }
    persistence.save()
    return null
  }
  const command = (values.command || '').trim()
  if (!command) return null
  return {
    id: uid('am'),
    title,
    kind: 'command',
    command,
    opensAs: (values.opensAs || '').trim() === 'split' ? 'split' : 'tab'
  }
}

function buildSystemUpdatePanel(panel: HTMLElement): void {
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
