import { themes } from './themes'
import { settings, state, saveSoon, requestSidebar, resolveTheme, applyBgColor, uid } from './state'
import type { PaletteCommand, ProjectNode, Application, ActionMenuItem } from './types'
import { BUILTIN_ACTIONS } from './types'
import { flattenProjects, removeProject } from './catalog'
import { makeProject } from './tree'
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
  tabs: { label: string; build: (el: HTMLElement) => void }[]
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
  if (tabs.length) show(0)
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
  buildWorkspacePanel(panels['Workspace'])
  buildProjectsPanel(panels['Projects'])
  buildCommandsPanel(panels['Commands'])
  buildShortcutsPanel(panels['Shortcuts'])
  buildActionMenuPanel(panels['Action menu'])
  buildSystemUpdatePanel(panels['System update'])

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
        saveSoon()
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
        saveSoon()
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
      saveSoon()
      requestSidebar()
      renderTree()
      renderDetail()
    })
    listCol.appendChild(addBtn)
  }

  // The Applications section of the selected project's editor.
  const renderApps = (p: ProjectNode, parent: HTMLElement): void => {
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
          saveSoon()
        })
        nameI.addEventListener('keydown', (e) => e.stopPropagation())
        const cmdI = document.createElement('input')
        cmdI.type = 'text'
        cmdI.value = rc.command
        cmdI.placeholder = 'shell command'
        cmdI.addEventListener('change', () => {
          rc.command = cmdI.value.trim()
          saveSoon()
        })
        cmdI.addEventListener('keydown', (e) => e.stopPropagation())
        const delRc = document.createElement('button')
        delRc.className = 'app-del'
        delRc.textContent = '✕'
        delRc.title = 'Remove command'
        delRc.addEventListener('click', () => {
          app.runCommands = (app.runCommands ?? []).filter((x) => x !== rc)
          saveSoon()
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
        saveSoon()
        renderDetail()
      })
      card.appendChild(addRc)

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
        saveSoon()
      })
      input.addEventListener('keydown', (e) => e.stopPropagation())
      const del = document.createElement('button')
      del.className = 'feat-del'
      del.textContent = '✕'
      del.title = 'Remove feature'
      del.addEventListener('click', () => {
        p.features = (p.features ?? []).filter((f) => f !== feat)
        saveSoon()
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
      saveSoon()
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
        saveSoon()
        renderDetail()
      })
      head.append(title, del)
      card.appendChild(head)
      field(card, 'Name', rc.name, 'Deploy', (v) => {
        rc.name = v.trim() || rc.name
        title.textContent = rc.name || '(unnamed command)'
        saveSoon()
      })
      field(card, 'Command', rc.command, 'npm run deploy', (v) => {
        rc.command = v.trim()
        saveSoon()
      })
      parent.appendChild(card)
    })
    const add = document.createElement('button')
    add.className = 'settings-inline-btn'
    add.textContent = '+ Add command'
    add.addEventListener('click', () => {
      p.runCommands = p.runCommands ?? []
      p.runCommands.push({ id: uid('rc'), name: 'command', command: '' })
      saveSoon()
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
    buildSubTabs(detailCol, [
      {
        label: 'General',
        build: (el) => {
          field(el, 'Name', p.name, 'Movve', (v) => {
            p.name = v.trim()
            renderTree()
            requestSidebar()
            saveSoon()
          })
          field(el, 'Path', p.path, '~/code/movve', (v) => {
            p.path = v.trim()
            requestSidebar()
            saveSoon()
          })
          field(
            el,
            'Group (workspace)',
            p.group ?? '',
            'work (optional)',
            (v) => {
              const g = v.trim()
              p.group = g || undefined
              if (g && !settings.groups.includes(g)) settings.groups.push(g)
              renderTree()
              renderGroups()
              requestSidebar()
              saveSoon()
            },
            { options: groupOptions() }
          )
          field(el, 'Command', p.command ?? '', 'claude (run on open, optional)', (v) => {
            p.command = v.trim() || undefined
            saveSoon()
          })
          field(
            el,
            'Startup command',
            p.startup ?? '',
            'run in every terminal opened inside (optional)',
            (v) => {
              p.startup = v.trim() || undefined
              saveSoon()
            }
          )
          field(el, 'Shell', p.shell ?? '', '/bin/zsh (override, optional)', (v) => {
            p.shell = v.trim() || undefined
            saveSoon()
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
              saveSoon()
            },
            { textarea: true, rows: 4 }
          )
        }
      },
      { label: 'Apps', build: (el) => renderApps(p, el) },
      { label: 'Features', build: (el) => renderFeatures(p, el) },
      { label: 'Run commands', build: (el) => renderRunCommands(p, el) }
    ])

    const actions = document.createElement('div')
    actions.className = 'proj-detail-actions'
    const addSub = document.createElement('button')
    addSub.className = 'settings-inline-btn'
    addSub.textContent = '+ Add sub-project'
    addSub.addEventListener('click', () => {
      const child = makeProject(uid('p'), 'New sub-project', '')
      p.children.push(child)
      selected = child
      saveSoon()
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
      saveSoon()
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
          saveSoon()
        })
        ide.style.maxWidth = '280px'
        const zsh = labeledInput(el, 'Update zsh config', 'text', settings.commands.openMyZsh, (v) => {
          settings.commands.openMyZsh = v.trim() || 'openmyzsh'
          saveSoon()
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
      saveSoon()
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
    saveSoon()
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
    const j = i + delta
    if (j < 0 || j >= settings.actionMenu.length) return
    const arr = settings.actionMenu
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
    saveSoon()
    render()
  }

  const render = (): void => {
    list.replaceChildren()
    if (!settings.actionMenu.length) {
      list.insertAdjacentHTML('beforeend', '<div class="field-hint">No items.</div>')
    }
    settings.actionMenu.forEach((item, i) => {
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
      down.disabled = i === settings.actionMenu.length - 1
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
        saveSoon()
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
        settings.actionMenu = settings.actionMenu.filter((x) => x !== item)
        saveSoon()
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
        settings.actionMenu.push(added)
        saveSoon()
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
    saveSoon()
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
    saveSoon()
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
    saveSoon()
  })
  repo.style.maxWidth = '320px'
  repo.placeholder = '~/path/to/crafterm'
  panel.insertAdjacentHTML(
    'beforeend',
    '<div class="field-hint">Local clone of the Crafterm source repo (must contain package.json).</div>'
  )

  const cmd = labeledInput(panel, 'Update command', 'text', settings.updateCommand, (v) => {
    settings.updateCommand = v.trim() || 'run-crafterm-deploy'
    saveSoon()
  })
  cmd.style.maxWidth = '320px'
  cmd.placeholder = 'run-crafterm-deploy'
  panel.insertAdjacentHTML(
    'beforeend',
    '<div class="field-hint">Shell command run in the codebase path. Must produce <code>dist/Crafterm.app</code>. Defaults to <code>run-crafterm-deploy</code>.</div>'
  )
}
