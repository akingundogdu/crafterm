import type { ProjectNode, Application } from '@ui/types/types'
import { settings, state } from '@ui/state/state'
import { UITexts } from '@texts'
import {
  openProject,
  newTab,
  splitProjectRight,
  splitActivePane,
  runApplications,
  createFeature,
  resolveAppPath
} from '@ui/commands/commands'
import { flattenProjects } from '@ui/catalog/catalog'
import { overlayModal, makeSearchInput } from '../shared'

// ---- Project picker: open a saved project (or a blank terminal) ----

export function showProjectPicker(parentFolderId: string | null, opts?: { split?: boolean }): void {
  const splitMode = !!opts?.split
  const { modal, close } = overlayModal('picker-modal')

  const h = (
    <h2>{splitMode ? UITexts.Pickers.project.split : UITexts.Pickers.project.open}</h2>
  ) as HTMLHeadingElement
  const input = (
    <input
      class="search-box-input"
      type="text"
      placeholder={
        splitMode
          ? UITexts.Pickers.project.splitPlaceholder
          : UITexts.Pickers.project.openPlaceholder
      }
      ref={(el: HTMLInputElement) => {
        el.spellcheck = false
      }}
    />
  ) as HTMLInputElement
  const list = (<div class="pick-list picker-list" />) as HTMLDivElement
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
      const row = (
        <div class={'pick-row project-row' + (i === sel ? ' active' : '')}>
          <span class="picker-name">{e.label}</span>
          {e.sub && <span class="project-sub">{e.sub}</span>}
        </div>
      ) as HTMLDivElement
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
  const h = (<h2>{`Run — ${project.name}`}</h2>) as HTMLHeadingElement
  modal.append(h)

  if (!apps.length || !settings.environments.length) {
    modal.insertAdjacentHTML(
      'beforeend',
      `<div class="empty-hint">${
        apps.length ? UITexts.Pickers.project.noEnvironments : UITexts.Pickers.project.noApplications
      } Add them in Settings → Projects.</div>`
    )
    return
  }

  let env = settings.environments[0]
  modal.insertAdjacentHTML('beforeend', '<div class="reminder-label">Environment</div>')
  const envBar = (<div class="run-env-bar" />) as HTMLDivElement
  const envBtns: HTMLButtonElement[] = []
  settings.environments.forEach((name) => {
    const b = (
      <button class={'run-env-chip' + (name === env ? ' active' : '')}>{name}</button>
    ) as HTMLButtonElement
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
  const list = (<div class="run-app-list" />) as HTMLDivElement
  modal.append(list)
  const checks = new Map<Application, HTMLInputElement>()
  const renderApps = (): void => {
    list.replaceChildren()
    checks.clear()
    apps.forEach((app) => {
      const cmd = (app.commands?.[env] ?? '').trim()
      const cb = (
        <input
          type="checkbox"
          ref={(el: HTMLInputElement) => {
            el.checked = !!cmd
            el.disabled = !cmd
          }}
        />
      ) as HTMLInputElement
      const row = (
        <label class={'run-app-row' + (cmd ? '' : ' disabled')}>
          {cb}
          <span class="run-app-name">{app.name}</span>
          <span class="run-app-cmd">{cmd || `no command for ${env}`}</span>
        </label>
      ) as HTMLLabelElement
      checks.set(app, cb)
      list.appendChild(row)
    })
  }
  renderApps()

  const cancel = (<button>{UITexts.Pickers.project.cancel}</button>) as HTMLButtonElement
  cancel.addEventListener('click', close)
  const run = (<button class="button-primary">Run</button>) as HTMLButtonElement
  run.addEventListener('click', () => {
    const selected = apps.filter((a) => checks.get(a)?.checked)
    if (selected.length) void runApplications(project, env, selected)
    close()
  })
  const actions = (
    <div class="modal-actions">
      {cancel}
      {run}
    </div>
  ) as HTMLDivElement
  modal.append(actions)
}

// Pick a project that has applications, then open its run modal.
// Shared: pick a project that has applications, then run `onPick`.
function pickProjectWithApps(title: string, onPick: (p: ProjectNode) => void): void {
  const projects = flattenProjects(state.tree).filter((p) => p.apps?.length)
  const { modal, close } = overlayModal('picker-modal')
  const h = (<h2>{title}</h2>) as HTMLHeadingElement
  if (!projects.length) {
    modal.append(h)
    modal.insertAdjacentHTML(
      'beforeend',
      '<div class="empty-hint">No projects with applications. Add apps in Settings → Projects.</div>'
    )
    return
  }
  const input = makeSearchInput('Filter projects…  (↑↓ move · ⏎ select)', () => render())
  const list = (<div class="pick-list picker-list" />) as HTMLDivElement
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
      const n = p.apps?.length ?? 0
      const row = (
        <div class={'pick-row project-row' + (i === sel ? ' active' : '')}>
          <span class="picker-name">{p.name}</span>
          <span class="project-sub">{`${p.path} · ${n} app${n === 1 ? '' : 's'}`}</span>
        </div>
      ) as HTMLDivElement
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
  pickProjectWithApps(UITexts.Pickers.project.runApplications, showRunApps)
}

export function showFeaturePicker(): void {
  pickProjectWithApps(UITexts.Pickers.project.newFeature, showFeatureSetup)
}

// Project-specific named commands: a list with two run options per row —
// "Split" (drop into a split beside the active pane) and "New tab" (open as
// its own terminal under the project). Both spawn at the project's path.
export function showRunCommand(project: ProjectNode): void {
  const cmds = project.runCommands ?? []
  const { modal, close } = overlayModal('picker-modal')
  const h = (<h2>{`Run command — ${project.name}`}</h2>) as HTMLHeadingElement
  modal.append(h)
  if (!cmds.length) {
    modal.insertAdjacentHTML(
      'beforeend',
      '<div class="empty-hint">No run commands. Add them in Settings → Projects.</div>'
    )
    return
  }
  const list = (<div class="pick-list picker-list" />) as HTMLDivElement
  modal.append(list)
  for (const rc of cmds) {
    const main = (
      <div class="claude-main">
        <span class="picker-name">{rc.name}</span>
        <span class="project-sub">{rc.command}</span>
      </div>
    ) as HTMLDivElement
    const splitBtn = (
      <button class="wt-act" title={UITexts.Pickers.project.runSplitTitle}>
        Split
      </button>
    ) as HTMLButtonElement
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
    const tabBtn = (
      <button class="wt-act" title={UITexts.Pickers.project.runTabTitle}>
        New tab
      </button>
    ) as HTMLButtonElement
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
    const row = (
      <div class="pick-row project-row">
        {main}
        {splitBtn}
        {tabBtn}
      </div>
    ) as HTMLDivElement
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
  const h = (<h2>{`Run ${app.name} — ${project.name}`}</h2>) as HTMLHeadingElement
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
  const list = (<div class="pick-list picker-list" />) as HTMLDivElement
  modal.append(list)
  for (const env of envs) {
    const dev = (app.commands[env] ?? '').trim()
    const command = startup ? `${startup} && ${dev}` : dev
    const main = (
      <div class="claude-main">
        <span class="picker-name">{env}</span>
        <span class="project-sub">{dev}</span>
      </div>
    ) as HTMLDivElement
    const target = { name: `${app.name} · ${env}`, path: appPath, command, env: project.env, shell: project.shell }
    const splitBtn = (
      <button class="wt-act" title={UITexts.Pickers.project.runSplitTitle}>
        Split
      </button>
    ) as HTMLButtonElement
    splitBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      void splitProjectRight(target)
      close()
    })
    const tabBtn = (
      <button class="wt-act" title={UITexts.Pickers.project.runTabTitle}>
        New tab
      </button>
    ) as HTMLButtonElement
    tabBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      void openProject(target, project.id)
      close()
    })
    const row = (
      <div class="pick-row project-row">
        {main}
        {splitBtn}
        {tabBtn}
      </div>
    ) as HTMLDivElement
    list.appendChild(row)
  }
}

// ---- Feature setup: feature name + branch + env + apps (+ per-app worktree) ----

const sanitizeBranch = (s: string): string => s.trim().replace(/\s+/g, '-')

export function showFeatureSetup(project: ProjectNode): void {
  const apps = project.apps ?? []
  const hasApps = apps.length > 0 && settings.environments.length > 0
  const { modal, close } = overlayModal('picker-modal')
  const h = (<h2>{`New feature — ${project.name}`}</h2>) as HTMLHeadingElement
  modal.append(h)
  if (!hasApps) {
    modal.insertAdjacentHTML(
      'beforeend',
      `<div class="empty-hint">${
        apps.length ? UITexts.Pickers.project.noEnvironmentsConfigured : UITexts.Pickers.project.noApplicationsDefined
      } The feature folder will be created without any auto-spawned terminals. Define apps in Settings → Projects to launch them automatically.</div>`
    )
  }

  modal.insertAdjacentHTML('beforeend', '<div class="reminder-label">Feature name</div>')
  const nameInput = (<input class="reminder-input" placeholder="maxi onboarding" />) as HTMLInputElement
  modal.append(nameInput)

  modal.insertAdjacentHTML('beforeend', '<div class="reminder-label">Branch</div>')
  const branchInput = (<input class="reminder-input" placeholder="maxi-onboarding" />) as HTMLInputElement
  modal.append(branchInput)
  let branchEdited = false
  branchInput.addEventListener('input', () => {
    branchEdited = true
  })
  nameInput.addEventListener('input', () => {
    if (!branchEdited) branchInput.value = sanitizeBranch(nameInput.value)
  })

  modal.insertAdjacentHTML('beforeend', '<div class="reminder-label">Base branch</div>')
  const baseInput = (
    <input
      class="reminder-input"
      ref={(el: HTMLInputElement) => {
        el.value = 'main'
      }}
    />
  ) as HTMLInputElement
  modal.append(baseInput)

  let env = settings.environments[0] ?? ''
  const incl = new Map<Application, HTMLInputElement>()
  const wt = new Map<Application, HTMLInputElement>()
  if (hasApps) {
    modal.insertAdjacentHTML('beforeend', '<div class="reminder-label">Environment</div>')
    const envBar = (<div class="run-env-bar" />) as HTMLDivElement
    const envBtns: HTMLButtonElement[] = []
    settings.environments.forEach((name) => {
      const b = (
        <button class={'run-env-chip' + (name === env ? ' active' : '')}>{name}</button>
      ) as HTMLButtonElement
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
    const list = (<div class="run-app-list" />) as HTMLDivElement
    modal.append(list)
    const renderApps = (): void => {
      list.replaceChildren()
      incl.clear()
      wt.clear()
      apps.forEach((app) => {
        const cmd = (app.commands?.[env] ?? '').trim()
        const cb = (
          <input
            type="checkbox"
            title={UITexts.Pickers.project.includeTitle}
            ref={(el: HTMLInputElement) => {
              el.checked = !!cmd
              el.disabled = !cmd
            }}
          />
        ) as HTMLInputElement
        const wtCb = (
          <input
            type="checkbox"
            ref={(el: HTMLInputElement) => {
              el.disabled = !cmd
            }}
          />
        ) as HTMLInputElement
        const wtLabel = (
          <label class="feature-wt">
            {wtCb}
            worktree
          </label>
        ) as HTMLLabelElement
        const row = (
          <div class={'run-app-row feature-app-row' + (cmd ? '' : ' disabled')}>
            {cb}
            <span class="run-app-name">{app.name}</span>
            <span class="run-app-cmd">{cmd || `no command for ${env}`}</span>
            {wtLabel}
          </div>
        ) as HTMLDivElement
        incl.set(app, cb)
        wt.set(app, wtCb)
        list.appendChild(row)
      })
    }
    renderApps()
  }

  const cancel = (<button>{UITexts.Pickers.project.cancel}</button>) as HTMLButtonElement
  cancel.addEventListener('click', close)
  const create = (<button class="button-primary">Create</button>) as HTMLButtonElement
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
  const actions = (
    <div class="modal-actions">
      {cancel}
      {create}
    </div>
  ) as HTMLDivElement
  modal.append(actions)
  nameInput.focus()
}
