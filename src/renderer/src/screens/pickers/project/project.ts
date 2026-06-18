import type { ProjectNode, Application } from '../../../types'
import { settings, state } from '../../../state'
import {
  openProject,
  newTab,
  splitProjectRight,
  splitActivePane,
  runApplications,
  createFeature,
  resolveAppPath
} from '../../../commands'
import { flattenProjects } from '../../../catalog'
import { overlayModal, makeSearchInput } from '../shared'

// ---- Project picker: open a saved project (or a blank terminal) ----

export function showProjectPicker(parentFolderId: string | null, opts?: { split?: boolean }): void {
  const splitMode = !!opts?.split
  const { modal, close } = overlayModal('picker-modal')

  const h = document.createElement('h2')
  h.textContent = splitMode ? 'Split with project' : 'Open project'
  const input = document.createElement('input')
  input.className = 'search-box-input'
  input.type = 'text'
  input.placeholder = splitMode
    ? 'Filter projects…  (⏎ split right)'
    : 'Filter projects…  (↑↓ move · ⏎ open · ⌘⏎ split right)'
  input.spellcheck = false
  const list = document.createElement('div')
  list.className = 'pick-list picker-list'
  modal.append(h, input, list)

  interface Entry {
    label: string
    sub?: string
    openTab: () => void
    openSplit: () => void
  }
  const entries: Entry[] = [
    {
      label: 'Blank terminal',
      openTab: () => void newTab(parentFolderId),
      openSplit: () => void splitActivePane('row')
    },
    ...flattenProjects(state.tree).map((p) => ({
      label: p.name,
      sub: p.command ? `${p.path} · ${p.command}` : p.path,
      // Always nest the new terminal under the picked project's node (not the
      // cmd+O context), so it's grouped with that project in the sidebar.
      openTab: () => void openProject(p),
      openSplit: () => void splitProjectRight(p)
    })),
    // run-apps entries for projects that define applications
    ...flattenProjects(state.tree)
      .filter((p) => p.apps?.length)
      .map((p) => ({
        label: `▷ ${p.name} — run apps`,
        sub: `${p.apps?.length} app${p.apps?.length === 1 ? '' : 's'}`,
        openTab: () => showRunApps(p),
        openSplit: () => showRunApps(p)
      }))
  ]
  let sel = 0

  const filtered = (): Entry[] => {
    const q = input.value.trim().toLowerCase()
    if (!q) return entries
    // match name, path and command (contains)
    return entries.filter((e) => (e.label + ' ' + (e.sub ?? '')).toLowerCase().includes(q))
  }

  // Enter (or click) opens a new tab; ⌘Enter (or split mode) splits the active pane.
  const choose = (e: Entry, split: boolean): void => {
    if (split || splitMode) e.openSplit()
    else e.openTab()
    close()
  }

  const render = (): void => {
    const items = filtered()
    if (sel >= items.length) sel = Math.max(0, items.length - 1)
    list.replaceChildren()
    items.forEach((e, i) => {
      const row = document.createElement('div')
      row.className = 'pick-row project-row' + (i === sel ? ' active' : '')
      const name = document.createElement('span')
      name.className = 'picker-name'
      name.textContent = e.label
      row.appendChild(name)
      if (e.sub) {
        const sub = document.createElement('span')
        sub.className = 'project-sub'
        sub.textContent = e.sub
        row.appendChild(sub)
      }
      row.addEventListener('click', (ev) => choose(e, ev.metaKey || ev.ctrlKey))
      row.addEventListener('mouseenter', () => {
        sel = i
        highlight()
      })
      list.appendChild(row)
    })
  }
  const highlight = (): void => {
    list.querySelectorAll<HTMLElement>('.project-row').forEach((el, i) => {
      el.classList.toggle('active', i === sel)
    })
  }

  input.addEventListener('input', () => {
    sel = 0
    render()
  })
  input.addEventListener('keydown', (e) => {
    e.stopPropagation()
    const items = filtered()
    if (e.key === 'Escape') close()
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      sel = Math.min(items.length - 1, sel + 1)
      highlight()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      sel = Math.max(0, sel - 1)
      highlight()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (items[sel]) choose(items[sel], e.metaKey || e.ctrlKey)
    }
  })
  render()
  input.focus()
}


// ---- Run applications: pick environment + apps, open a tiled tab ----

// Modal for one project: choose an environment, tick apps, run them together.
export function showRunApps(project: ProjectNode): void {
  const apps = project.apps ?? []
  const { modal, close } = overlayModal('picker-modal')
  const h = document.createElement('h2')
  h.textContent = `Run — ${project.name}`
  modal.append(h)

  if (!apps.length || !settings.environments.length) {
    modal.insertAdjacentHTML(
      'beforeend',
      `<div class="empty-hint">${
        apps.length ? 'No environments.' : 'No applications.'
      } Add them in Settings → Projects.</div>`
    )
    return
  }

  let env = settings.environments[0]
  modal.insertAdjacentHTML('beforeend', '<div class="reminder-label">Environment</div>')
  const envBar = document.createElement('div')
  envBar.className = 'run-env-bar'
  const envBtns: HTMLButtonElement[] = []
  settings.environments.forEach((name) => {
    const b = document.createElement('button')
    b.className = 'run-env-chip' + (name === env ? ' active' : '')
    b.textContent = name
    b.addEventListener('click', () => {
      env = name
      envBtns.forEach((x) => x.classList.toggle('active', x === b))
      renderApps()
    })
    envBtns.push(b)
    envBar.appendChild(b)
  })
  modal.append(envBar)

  modal.insertAdjacentHTML('beforeend', '<div class="reminder-label">Applications</div>')
  const list = document.createElement('div')
  list.className = 'run-app-list'
  modal.append(list)
  const checks = new Map<Application, HTMLInputElement>()
  const renderApps = (): void => {
    list.replaceChildren()
    checks.clear()
    apps.forEach((app) => {
      const cmd = (app.commands?.[env] ?? '').trim()
      const row = document.createElement('label')
      row.className = 'run-app-row' + (cmd ? '' : ' disabled')
      const cb = document.createElement('input')
      cb.type = 'checkbox'
      cb.checked = !!cmd
      cb.disabled = !cmd
      const name = document.createElement('span')
      name.className = 'run-app-name'
      name.textContent = app.name
      const sub = document.createElement('span')
      sub.className = 'run-app-cmd'
      sub.textContent = cmd || `no command for ${env}`
      row.append(cb, name, sub)
      checks.set(app, cb)
      list.appendChild(row)
    })
  }
  renderApps()

  const actions = document.createElement('div')
  actions.className = 'modal-actions'
  const cancel = document.createElement('button')
  cancel.textContent = 'Cancel'
  cancel.addEventListener('click', close)
  const run = document.createElement('button')
  run.className = 'button-primary'
  run.textContent = 'Run'
  run.addEventListener('click', () => {
    const selected = apps.filter((a) => checks.get(a)?.checked)
    if (selected.length) void runApplications(project, env, selected)
    close()
  })
  actions.append(cancel, run)
  modal.append(actions)
}

// Pick a project that has applications, then open its run modal.
// Shared: pick a project that has applications, then run `onPick`.
function pickProjectWithApps(title: string, onPick: (p: ProjectNode) => void): void {
  const projects = flattenProjects(state.tree).filter((p) => p.apps?.length)
  const { modal, close } = overlayModal('picker-modal')
  const h = document.createElement('h2')
  h.textContent = title
  if (!projects.length) {
    modal.append(h)
    modal.insertAdjacentHTML(
      'beforeend',
      '<div class="empty-hint">No projects with applications. Add apps in Settings → Projects.</div>'
    )
    return
  }
  const input = makeSearchInput('Filter projects…  (↑↓ move · ⏎ select)', () => render())
  const list = document.createElement('div')
  list.className = 'pick-list picker-list'
  modal.append(h, input, list)
  let sel = 0
  const filtered = (): ProjectNode[] => {
    const q = input.value.trim().toLowerCase()
    return q ? projects.filter((p) => `${p.name} ${p.path}`.toLowerCase().includes(q)) : projects
  }
  const choose = (p: ProjectNode): void => {
    close()
    onPick(p)
  }
  const highlight = (): void => {
    list.querySelectorAll<HTMLElement>('.project-row').forEach((el, i) => {
      el.classList.toggle('active', i === sel)
    })
  }
  const render = (): void => {
    const items = filtered()
    if (sel >= items.length) sel = Math.max(0, items.length - 1)
    list.replaceChildren()
    items.forEach((p, i) => {
      const row = document.createElement('div')
      row.className = 'pick-row project-row' + (i === sel ? ' active' : '')
      const name = document.createElement('span')
      name.className = 'picker-name'
      name.textContent = p.name
      const sub = document.createElement('span')
      sub.className = 'project-sub'
      const n = p.apps?.length ?? 0
      sub.textContent = `${p.path} · ${n} app${n === 1 ? '' : 's'}`
      row.append(name, sub)
      row.addEventListener('click', () => choose(p))
      row.addEventListener('mouseenter', () => {
        sel = i
        highlight()
      })
      list.appendChild(row)
    })
  }
  input.addEventListener('keydown', (e) => {
    e.stopPropagation()
    const items = filtered()
    if (e.key === 'Escape') close()
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      sel = Math.min(items.length - 1, sel + 1)
      highlight()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      sel = Math.max(0, sel - 1)
      highlight()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (items[sel]) choose(items[sel])
    }
  })
  render()
  input.focus()
}

export function showRunAppsPicker(): void {
  pickProjectWithApps('Run applications', showRunApps)
}

export function showFeaturePicker(): void {
  pickProjectWithApps('New feature', showFeatureSetup)
}

// Project-specific named commands: a list with two run options per row —
// "Split" (drop into a split beside the active pane) and "New tab" (open as
// its own terminal under the project). Both spawn at the project's path.
export function showRunCommand(project: ProjectNode): void {
  const cmds = project.runCommands ?? []
  const { modal, close } = overlayModal('picker-modal')
  const h = document.createElement('h2')
  h.textContent = `Run command — ${project.name}`
  modal.append(h)
  if (!cmds.length) {
    modal.insertAdjacentHTML(
      'beforeend',
      '<div class="empty-hint">No run commands. Add them in Settings → Projects.</div>'
    )
    return
  }
  const list = document.createElement('div')
  list.className = 'pick-list picker-list'
  modal.append(list)
  for (const rc of cmds) {
    const row = document.createElement('div')
    row.className = 'pick-row project-row'
    const main = document.createElement('div')
    main.className = 'claude-main'
    const title = document.createElement('span')
    title.className = 'picker-name'
    title.textContent = rc.name
    const sub = document.createElement('span')
    sub.className = 'project-sub'
    sub.textContent = rc.command
    main.append(title, sub)
    const splitBtn = document.createElement('button')
    splitBtn.className = 'wt-act'
    splitBtn.textContent = 'Split'
    splitBtn.title = 'Run in a split beside the active pane'
    splitBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      void splitProjectRight({
        name: rc.name,
        path: project.path,
        command: rc.command,
        env: project.env,
        shell: project.shell
      })
      close()
    })
    const tabBtn = document.createElement('button')
    tabBtn.className = 'wt-act'
    tabBtn.textContent = 'New tab'
    tabBtn.title = 'Run in a new terminal tab under the project'
    tabBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      void openProject(
        {
          name: rc.name,
          path: project.path,
          command: rc.command,
          env: project.env,
          shell: project.shell
        },
        project.id
      )
      close()
    })
    row.append(main, splitBtn, tabBtn)
    list.appendChild(row)
  }
}

// Launch a single application (from the pane ⋯ menu). Lists each environment the
// app has a command for; Split runs it beside the active pane, New tab opens it in
// a fresh tab under the project. The project's startup is chained before the dev
// command, matching runApplications().
export function showRunApp(project: ProjectNode, app: Application): void {
  const envs = settings.environments.filter((e) => (app.commands?.[e] ?? '').trim())
  const { modal, close } = overlayModal('picker-modal')
  const h = document.createElement('h2')
  h.textContent = `Run ${app.name} — ${project.name}`
  modal.append(h)
  if (!envs.length) {
    modal.insertAdjacentHTML(
      'beforeend',
      '<div class="empty-hint">No commands configured for this application. Add them in Settings → Projects.</div>'
    )
    return
  }
  const appPath = resolveAppPath(project.path, app.path)
  const startup = project.startup?.trim()
  const list = document.createElement('div')
  list.className = 'pick-list picker-list'
  modal.append(list)
  for (const env of envs) {
    const dev = (app.commands[env] ?? '').trim()
    const command = startup ? `${startup} && ${dev}` : dev
    const row = document.createElement('div')
    row.className = 'pick-row project-row'
    const main = document.createElement('div')
    main.className = 'claude-main'
    const title = document.createElement('span')
    title.className = 'picker-name'
    title.textContent = env
    const sub = document.createElement('span')
    sub.className = 'project-sub'
    sub.textContent = dev
    main.append(title, sub)
    const target = { name: `${app.name} · ${env}`, path: appPath, command, env: project.env, shell: project.shell }
    const splitBtn = document.createElement('button')
    splitBtn.className = 'wt-act'
    splitBtn.textContent = 'Split'
    splitBtn.title = 'Run in a split beside the active pane'
    splitBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      void splitProjectRight(target)
      close()
    })
    const tabBtn = document.createElement('button')
    tabBtn.className = 'wt-act'
    tabBtn.textContent = 'New tab'
    tabBtn.title = 'Run in a new terminal tab under the project'
    tabBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      void openProject(target, project.id)
      close()
    })
    row.append(main, splitBtn, tabBtn)
    list.appendChild(row)
  }
}

// ---- Feature setup: feature name + branch + env + apps (+ per-app worktree) ----

const sanitizeBranch = (s: string): string => s.trim().replace(/\s+/g, '-')

export function showFeatureSetup(project: ProjectNode): void {
  const apps = project.apps ?? []
  const hasApps = apps.length > 0 && settings.environments.length > 0
  const { modal, close } = overlayModal('picker-modal')
  const h = document.createElement('h2')
  h.textContent = `New feature — ${project.name}`
  modal.append(h)
  if (!hasApps) {
    modal.insertAdjacentHTML(
      'beforeend',
      `<div class="empty-hint">${
        apps.length ? 'No environments configured.' : 'No applications defined for this project.'
      } The feature folder will be created without any auto-spawned terminals. Define apps in Settings → Projects to launch them automatically.</div>`
    )
  }

  modal.insertAdjacentHTML('beforeend', '<div class="reminder-label">Feature name</div>')
  const nameInput = document.createElement('input')
  nameInput.className = 'reminder-input'
  nameInput.placeholder = 'maxi onboarding'
  modal.append(nameInput)

  modal.insertAdjacentHTML('beforeend', '<div class="reminder-label">Branch</div>')
  const branchInput = document.createElement('input')
  branchInput.className = 'reminder-input'
  branchInput.placeholder = 'maxi-onboarding'
  modal.append(branchInput)
  let branchEdited = false
  branchInput.addEventListener('input', () => {
    branchEdited = true
  })
  nameInput.addEventListener('input', () => {
    if (!branchEdited) branchInput.value = sanitizeBranch(nameInput.value)
  })

  modal.insertAdjacentHTML('beforeend', '<div class="reminder-label">Base branch</div>')
  const baseInput = document.createElement('input')
  baseInput.className = 'reminder-input'
  baseInput.value = 'main'
  modal.append(baseInput)

  let env = settings.environments[0] ?? ''
  const incl = new Map<Application, HTMLInputElement>()
  const wt = new Map<Application, HTMLInputElement>()
  if (hasApps) {
    modal.insertAdjacentHTML('beforeend', '<div class="reminder-label">Environment</div>')
    const envBar = document.createElement('div')
    envBar.className = 'run-env-bar'
    const envBtns: HTMLButtonElement[] = []
    settings.environments.forEach((name) => {
      const b = document.createElement('button')
      b.className = 'run-env-chip' + (name === env ? ' active' : '')
      b.textContent = name
      b.addEventListener('click', () => {
        env = name
        envBtns.forEach((x) => x.classList.toggle('active', x === b))
        renderApps()
      })
      envBtns.push(b)
      envBar.appendChild(b)
    })
    modal.append(envBar)

    modal.insertAdjacentHTML(
      'beforeend',
      '<div class="reminder-label">Applications (✓ include · ⑂ worktree)</div>'
    )
    const list = document.createElement('div')
    list.className = 'run-app-list'
    modal.append(list)
    const renderApps = (): void => {
      list.replaceChildren()
      incl.clear()
      wt.clear()
      apps.forEach((app) => {
        const cmd = (app.commands?.[env] ?? '').trim()
        const row = document.createElement('div')
        row.className = 'run-app-row feature-app-row' + (cmd ? '' : ' disabled')
        const cb = document.createElement('input')
        cb.type = 'checkbox'
        cb.checked = !!cmd
        cb.disabled = !cmd
        cb.title = 'Include'
        const name = document.createElement('span')
        name.className = 'run-app-name'
        name.textContent = app.name
        const sub = document.createElement('span')
        sub.className = 'run-app-cmd'
        sub.textContent = cmd || `no command for ${env}`
        const wtLabel = document.createElement('label')
        wtLabel.className = 'feature-wt'
        const wtCb = document.createElement('input')
        wtCb.type = 'checkbox'
        wtCb.disabled = !cmd
        wtLabel.append(wtCb, document.createTextNode('worktree'))
        row.append(cb, name, sub, wtLabel)
        incl.set(app, cb)
        wt.set(app, wtCb)
        list.appendChild(row)
      })
    }
    renderApps()
  }

  const actions = document.createElement('div')
  actions.className = 'modal-actions'
  const cancel = document.createElement('button')
  cancel.textContent = 'Cancel'
  cancel.addEventListener('click', close)
  const create = document.createElement('button')
  create.className = 'button-primary'
  create.textContent = 'Create'
  create.addEventListener('click', () => {
    const branch = sanitizeBranch(branchInput.value || nameInput.value)
    if (!branch) return
    const chosen = apps
      .filter((a) => incl.get(a)?.checked)
      .map((app) => ({ app, worktree: !!wt.get(app)?.checked }))
    if (!chosen.length) return
    void createFeature(project, { branch, base: baseInput.value, env, apps: chosen })
    close()
  })
  actions.append(cancel, create)
  modal.append(actions)
  nameInput.focus()
}

