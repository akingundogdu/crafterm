import { themes } from './themes'
import { settings, saveSoon, requestSidebar, resolveTheme, applyBgColor, uid } from './state'
import type { PaletteCommand, Project, Application } from './types'
import { flattenProjects, removeProject } from './catalog'
import { applyAppearance } from './pane'
import { applyOrientation, applySidebarFont } from './sidebar'
import { pickFolderPath } from './pickers'
import { makeCloseButton, promptForm, promptText } from './dialog'
import {
  KEYBINDINGS,
  effectiveCombo,
  comboLabel,
  comboFromEvent,
  setBinding,
  resetBinding,
  setRecording,
  isModifierKey
} from './keybindings'
import { syncProjectGroupToTree } from './commands'

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
    'Workspace',
    'Projects',
    'Commands',
    'Shortcuts'
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
  buildWorkspacePanel(panels['Workspace'])
  buildProjectsPanel(panels['Projects'])
  buildCommandsPanel(panels['Commands'])
  buildShortcutsPanel(panels['Shortcuts'])

  show('Appearance')
  document.body.appendChild(overlay)
}

function buildAppearancePanel(panel: HTMLElement): void {
  panel.insertAdjacentHTML('beforeend', '<h3>Appearance</h3>')
  const fam = labeledInput(panel, 'Font family', 'text', settings.font.family, (v) => {
    settings.font.family = v
    applyAppearance()
    saveSoon()
  })
  fam.style.maxWidth = '280px'
  labeledInput(panel, 'Terminal font size', 'number', String(settings.font.size), (v) => {
    const n = parseInt(v, 10)
    if (!Number.isNaN(n) && n >= 6 && n <= 40) {
      settings.font.size = n
      applyAppearance()
      saveSoon()
    }
  })
  buildBackgroundControl(panel)
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
    saveSoon()
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
          saveSoon()
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
    saveSoon()
    renderColors()
  })
  copyBtn.addEventListener('click', () => {
    settings.customTheme = { ...(resolveTheme() as unknown as Record<string, string>) }
    settings.themeName = 'Custom'
    sel.value = 'Custom'
    applyAppearance()
    saveSoon()
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
        saveSoon()
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
      saveSoon()
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
    saveSoon()
  })
  ask.append(cb, document.createTextNode('Ask which project to open on a new terminal'))
  panel.appendChild(ask)

  // ---- Global environments (dev/local/production) ----
  panel.insertAdjacentHTML('beforeend', '<div class="settings-subhead">Environments</div>')
  const envBar = document.createElement('div')
  envBar.className = 'env-bar'
  panel.appendChild(envBar)

  // ---- Catalog tree (left) + selected-project editor (right) ----
  const md = document.createElement('div')
  md.className = 'projects-md'
  const listCol = document.createElement('div')
  listCol.className = 'projects-md-list'
  const detailCol = document.createElement('div')
  detailCol.className = 'projects-md-detail'
  md.append(listCol, detailCol)
  panel.appendChild(md)

  let selected: Project | null = flattenProjects(settings.projects)[0] ?? null

  // A labeled field (input or textarea) appended to a given parent.
  const field = (
    parent: HTMLElement,
    label: string,
    value: string,
    placeholder: string,
    onChange: (v: string) => void,
    opts: { textarea?: boolean; rows?: number } = {}
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
        saveSoon()
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
        saveSoon()
        renderEnvs()
        renderDetail()
      })()
    })
    envBar.appendChild(add)
  }

  const renderTree = (): void => {
    listCol.replaceChildren()
    if (!settings.projects.length) {
      listCol.insertAdjacentHTML('beforeend', '<div class="field-hint">No projects yet.</div>')
    }
    const renderRows = (projects: Project[], depth: number): void => {
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
        if (p.children?.length) renderRows(p.children, depth + 1)
      })
    }
    renderRows(settings.projects, 0)

    const addBtn = document.createElement('button')
    addBtn.className = 'settings-inline-btn'
    addBtn.textContent = '+ Add project'
    addBtn.addEventListener('click', () => {
      const proj: Project = { name: 'New project', path: '' }
      settings.projects.push(proj)
      selected = proj
      saveSoon()
      renderTree()
      renderDetail()
    })
    listCol.appendChild(addBtn)
  }

  // The Applications section of the selected project's editor.
  const renderApps = (p: Project, parent: HTMLElement): void => {
    parent.insertAdjacentHTML('beforeend', '<div class="settings-subhead">Applications</div>')
    p.apps = p.apps ?? []
    if (!p.apps.length) {
      parent.insertAdjacentHTML(
        'beforeend',
        '<div class="field-hint">No applications. Add one to run it (with per-environment commands).</div>'
      )
    }
    p.apps.forEach((app) => {
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
        p.apps = (p.apps ?? []).filter((a) => a !== app)
        saveSoon()
        renderTree()
        renderDetail()
      })
      head.append(title, delApp)
      card.appendChild(head)

      field(card, 'Name', app.name, 'backend', (v) => {
        app.name = v.trim()
        title.textContent = app.name || '(unnamed app)'
        renderTree()
        saveSoon()
      })
      field(card, 'Path', app.path ?? '', 'relative to project, or absolute (optional)', (v) => {
        app.path = v.trim() || undefined
        saveSoon()
      })

      const opensWrap = document.createElement('div')
      opensWrap.className = 'field'
      const opensLab = document.createElement('label')
      opensLab.textContent = 'Opens as'
      const opensSel = document.createElement('select')
      opensSel.className = 'settings-select'
      ;[
        ['tab', 'New tab'],
        ['split', 'Split right']
      ].forEach(([v, lbl]) => {
        const o = document.createElement('option')
        o.value = v
        o.textContent = lbl
        if ((app.opensAs ?? 'tab') === v) o.selected = true
        opensSel.appendChild(o)
      })
      opensSel.addEventListener('change', () => {
        app.opensAs = opensSel.value as Application['opensAs']
        saveSoon()
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
          saveSoon()
        })
      }
      parent.appendChild(card)
    })

    const addApp = document.createElement('button')
    addApp.className = 'settings-inline-btn'
    addApp.textContent = '+ Add application'
    addApp.addEventListener('click', () => {
      p.apps = p.apps ?? []
      p.apps.push({ id: uid('app'), name: 'app', commands: {} })
      saveSoon()
      renderTree()
      renderDetail()
    })
    parent.appendChild(addApp)
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
    field(detailCol, 'Name', p.name, 'Movve', (v) => {
      p.name = v.trim()
      renderTree()
      saveSoon()
    })
    field(detailCol, 'Path', p.path, '~/code/movve', (v) => {
      p.path = v.trim()
      saveSoon()
    })
    field(detailCol, 'Group (workspace)', p.group ?? '', 'work (optional)', (v) => {
      p.group = v.trim() || undefined
      renderTree()
      syncProjectGroupToTree(p.path, p.group)
      saveSoon()
    })
    field(detailCol, 'Command', p.command ?? '', 'claude (run on open, optional)', (v) => {
      p.command = v.trim() || undefined
      saveSoon()
    })
    field(
      detailCol,
      'Startup command',
      p.startup ?? '',
      'run in every terminal opened inside (optional)',
      (v) => {
        p.startup = v.trim() || undefined
        saveSoon()
      }
    )
    field(detailCol, 'Shell', p.shell ?? '', '/bin/zsh (override, optional)', (v) => {
      p.shell = v.trim() || undefined
      saveSoon()
    })
    field(
      detailCol,
      'Environment vars',
      p.env ?? '',
      'KEY=VALUE (one per line, optional)',
      (v) => {
        p.env = v.trim() || undefined
        saveSoon()
      },
      { textarea: true, rows: 3 }
    )

    renderApps(p, detailCol)

    const actions = document.createElement('div')
    actions.className = 'proj-detail-actions'
    const addSub = document.createElement('button')
    addSub.className = 'settings-inline-btn'
    addSub.textContent = '+ Add sub-project'
    addSub.addEventListener('click', () => {
      p.children = p.children ?? []
      const child: Project = { name: 'New sub-project', path: '' }
      p.children.push(child)
      selected = child
      saveSoon()
      renderTree()
      renderDetail()
    })
    const del = document.createElement('button')
    del.className = 'settings-inline-btn project-del-btn'
    del.textContent = 'Delete project'
    del.addEventListener('click', () => {
      removeProject(settings.projects, p)
      selected = flattenProjects(settings.projects)[0] ?? null
      saveSoon()
      renderTree()
      renderDetail()
    })
    actions.append(addSub, del)
    detailCol.appendChild(actions)
  }

  renderEnvs()
  renderTree()
  renderDetail()
}

function buildCommandsPanel(panel: HTMLElement): void {
  panel.insertAdjacentHTML('beforeend', '<h3>Commands</h3>')
  const ide = labeledInput(panel, 'Open code file (ide)', 'text', settings.commands.ide, (v) => {
    settings.commands.ide = v.trim() || 'ide'
    saveSoon()
  })
  ide.style.maxWidth = '280px'
  const zsh = labeledInput(panel, 'Update zsh config', 'text', settings.commands.openMyZsh, (v) => {
    settings.commands.openMyZsh = v.trim() || 'openmyzsh'
    saveSoon()
  })
  zsh.style.maxWidth = '280px'
  panel.insertAdjacentHTML(
    'beforeend',
    '<div class="field-hint">Shell commands run in a new terminal.</div>'
  )

  buildMarkdownFoldersControl(panel)
  buildPaletteCommandsControl(panel)
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
    const cmds = settings.paletteCommands
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
            settings.paletteCommands = settings.paletteCommands.filter((x) => x.id !== c.id)
            saveSoon()
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
  if (existing) {
    const i = settings.paletteCommands.findIndex((x) => x.id === existing.id)
    if (i >= 0) settings.paletteCommands[i] = cmd
  } else {
    settings.paletteCommands.push(cmd)
  }
  saveSoon()
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
        saveSoon()
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
      saveSoon()
      render()
    }
  })
  render()
}

function buildWorkspacePanel(panel: HTMLElement): void {
  panel.insertAdjacentHTML('beforeend', '<h3>Workspace</h3>')
  const root = labeledInput(panel, 'Code root', 'text', settings.codeRoot, (v) => {
    settings.codeRoot = v.trim()
    saveSoon()
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
      saveSoon()
    }
  )
  ext.style.maxWidth = '280px'
  panel.insertAdjacentHTML(
    'beforeend',
    '<div class="field-hint">Clicking these files in a terminal opens them with <code>ide</code>.</div>'
  )

  const todo = labeledInput(panel, 'Todo list file', 'text', settings.todoFile, (v) => {
    settings.todoFile = v.trim()
    saveSoon()
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
    saveSoon()
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
      saveSoon()
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
    saveSoon()
    if (sel.value) window.crafterm.playSound(sel.value) // preview
  })
  soundRow.appendChild(sel)
  panel.appendChild(soundRow)
  panel.insertAdjacentHTML(
    'beforeend',
    '<div class="field-hint">Played when a terminal finishes or Claude needs you. Pick one to preview.</div>'
  )
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
      saveSoon()
    }
  )
  labeledInput(panel, 'Sidebar font size', 'number', String(settings.sidebar.fontSize), (v) => {
    const n = parseInt(v, 10)
    if (!Number.isNaN(n) && n >= 9 && n <= 22) {
      settings.sidebar.fontSize = n
      applySidebarFont()
      saveSoon()
    }
  })

  const detailDefs: Array<[keyof typeof settings.sidebar.details, string]> = [
    ['status', 'Show status text'],
    ['git', 'Show git branch'],
    ['panes', 'Show pane count']
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
      saveSoon()
    })
    r.append(cb, document.createTextNode(label))
    panel.appendChild(r)
  })
}
