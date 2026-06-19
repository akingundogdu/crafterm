import { settings, state, requestSidebar, uid } from '../../../state'
import { persistence } from '@services/storage/persistence.service'
import { promptForm, promptText } from '../../../dialog'
import { reconcileWorktrees, purgeWorktrees } from '@services/worktrees'
import { flattenProjects, removeProject } from '../../../catalog'
import { makeProject } from '../../../tree'
import { applicationRepo, iosConfigRepo } from '@services/storage/repositories'
import type { ProjectNode, Application, IosDevConfig } from '../../../types'
import { buildSubTabs, labeledInput } from '../shared'

export function buildProjectsPanel(panel: HTMLElement): void {
  panel.insertAdjacentHTML('beforeend', '<h3>Projects</h3>')

  const cb = (<input type="text" />) as HTMLInputElement
  cb.type = 'checkbox'
  cb.checked = settings.askProjectOnNew
  cb.addEventListener('change', () => {
    settings.askProjectOnNew = cb.checked
    persistence.save()
  })
  const ask = (
    <label class="checkbox-row">
      {cb}
      Ask which project to open on a new terminal
    </label>
  ) as HTMLLabelElement
  panel.appendChild(ask)

  // ---- Global environments (dev/local/production) ----
  panel.insertAdjacentHTML('beforeend', '<div class="settings-subhead">Environments</div>')
  const envBar = (<div class="env-bar" />) as HTMLDivElement
  panel.appendChild(envBar)

  // ---- Global workspace groups (used as the Group dropdown) ----
  panel.insertAdjacentHTML('beforeend', '<div class="settings-subhead">Groups (workspaces)</div>')
  const groupBar = (<div class="env-bar" />) as HTMLDivElement
  panel.appendChild(groupBar)

  // ---- Catalog tree (left) + selected-project editor (right) ----
  const listCol = (<div class="projects-md-list" />) as HTMLDivElement
  const detailCol = (<div class="projects-md-detail" />) as HTMLDivElement
  const md = (
    <div class="projects-md">
      {listCol}
      {detailCol}
    </div>
  ) as HTMLDivElement
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
    const lab = (<label>{label}</label>) as HTMLLabelElement
    const input = opts.textarea
      ? document.createElement('textarea')
      : document.createElement('input')
    if (input instanceof HTMLInputElement) input.type = 'text'
    if (input instanceof HTMLTextAreaElement) input.rows = opts.rows ?? 3
    input.value = value
    input.placeholder = placeholder
    input.addEventListener('change', () => onChange(input.value))
    const wrap = (
      <div class="field">
        {lab}
        {input}
      </div>
    ) as HTMLDivElement
    if (opts.options && input instanceof HTMLInputElement) {
      const listId = 'dl-' + Math.random().toString(36).slice(2, 9)
      input.setAttribute('list', listId)
      const dl = (<datalist id={listId}>{opts.options.map((v) => (<option value={v} />))}</datalist>) as HTMLDataListElement
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
    const lab = (<label>{label}</label>) as HTMLLabelElement
    const all = [...new Set([...options, ...(value ? [value] : [])])]
    const sel = (
      <select>
        <option value="">{emptyLabel}</option>
        {all.map((v) => (<option value={v}>{v}</option>))}
      </select>
    ) as HTMLSelectElement
    sel.value = value
    sel.addEventListener('change', () => onChange(sel.value))
    const wrap = (
      <div class="field">
        {lab}
        {sel}
      </div>
    ) as HTMLDivElement
    parent.appendChild(wrap)
  }

  const renderEnvs = (): void => {
    envBar.replaceChildren()
    settings.environments.forEach((name, i) => {
      const x = (
        <button class="env-chip-x" title="Remove environment">
          ×
        </button>
      ) as HTMLButtonElement
      x.addEventListener('click', () => {
        settings.environments.splice(i, 1)
        persistence.save()
        renderEnvs()
        renderDetail()
      })
      const chip = (
        <span class="env-chip">
          <span>{name}</span>
          {x}
        </span>
      ) as HTMLSpanElement
      envBar.appendChild(chip)
    })
    const add = (
      <button class="settings-inline-btn env-add">+ Environment</button>
    ) as HTMLButtonElement
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
      const x = (
        <button
          class="env-chip-x"
          title="Remove group from suggestions (does not unset on existing projects)"
        >
          ×
        </button>
      ) as HTMLButtonElement
      x.addEventListener('click', () => {
        settings.groups = settings.groups.filter((g) => g !== name)
        persistence.save()
        renderGroups()
        renderDetail()
      })
      const chip = (
        <span class="env-chip">
          <span>{name}</span>
          {x}
        </span>
      ) as HTMLSpanElement
      groupBar.appendChild(chip)
    })
    const add = (<button class="settings-inline-btn env-add">+ Group</button>) as HTMLButtonElement
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
        const row = (
          <div
            class={'proj-li' + (p === selected ? ' active' : '')}
            style={{ paddingLeft: 8 + depth * 14 + 'px' }}
          >
            <span class="proj-li-name">{p.name || '(untitled)'}</span>
            {p.group && <span class="proj-li-group">{p.group}</span>}
            {!!p.apps?.length && (
              <span class="proj-li-apps">{p.apps.length === 1 ? '1 app' : `${p.apps.length} apps`}</span>
            )}
          </div>
        ) as HTMLDivElement
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

    const addBtn = (<button class="settings-inline-btn">+ Add project</button>) as HTMLButtonElement
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
      const title = (<span class="app-card-title">{app.name || '(unnamed app)'}</span>) as HTMLSpanElement
      const delApp = (
        <button class="app-del" title="Remove application">
          ✕
        </button>
      ) as HTMLButtonElement
      delApp.addEventListener('click', () => {
        applicationRepo.remove(p.id, app.id)
        renderTree()
        renderDetail()
      })
      const card = (
        <div class="app-card">
          <div class="app-card-head">
            {title}
            {delApp}
          </div>
        </div>
      ) as HTMLDivElement

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

      const opensLab = (<label>Opens as</label>) as HTMLLabelElement
      const opensSel = (<select class="settings-select" />) as HTMLSelectElement
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
      const opensWrap = (
        <div class="field">
          {opensLab}
          {opensSel}
        </div>
      ) as HTMLDivElement
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
        const nameI = (<input type="text" placeholder="name" />) as HTMLInputElement
        nameI.value = rc.name
        nameI.addEventListener('change', () => {
          rc.name = nameI.value.trim() || rc.name
          applicationRepo.upsert(p.id, app)
        })
        nameI.addEventListener('keydown', (e) => e.stopPropagation())
        const cmdI = (<input type="text" placeholder="shell command" />) as HTMLInputElement
        cmdI.value = rc.command
        cmdI.addEventListener('change', () => {
          rc.command = cmdI.value.trim()
          applicationRepo.upsert(p.id, app)
        })
        cmdI.addEventListener('keydown', (e) => e.stopPropagation())
        const delRc = (
          <button class="app-del" title="Remove command">
            ✕
          </button>
        ) as HTMLButtonElement
        delRc.addEventListener('click', () => {
          app.runCommands = (app.runCommands ?? []).filter((x) => x !== rc)
          applicationRepo.upsert(p.id, app)
          renderDetail()
        })
        const row = (
          <div class="app-rc-row">
            {nameI}
            {cmdI}
            {delRc}
          </div>
        ) as HTMLDivElement
        card.appendChild(row)
      })
      const addRc = (
        <button class="settings-inline-btn app-rc-add">+ Add run command</button>
      ) as HTMLButtonElement
      addRc.addEventListener('click', () => {
        app.runCommands = app.runCommands ?? []
        app.runCommands.push({ id: uid('rc'), name: 'command', command: '' })
        applicationRepo.upsert(p.id, app)
        renderDetail()
      })
      card.appendChild(addRc)

      parent.appendChild(card)
    })

    const addApp = (<button class="settings-inline-btn">+ Add application</button>) as HTMLButtonElement
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
      const input = (<input type="text" placeholder="feature name" />) as HTMLInputElement
      input.value = feat.name
      input.addEventListener('change', () => {
        feat.name = input.value.trim() || feat.name
        persistence.save()
      })
      input.addEventListener('keydown', (e) => e.stopPropagation())
      const del = (
        <button class="feat-del" title="Remove feature">
          ✕
        </button>
      ) as HTMLButtonElement
      del.addEventListener('click', () => {
        p.features = (p.features ?? []).filter((f) => f !== feat)
        persistence.save()
        renderTree()
        renderDetail()
      })
      const row = (
        <div class="feat-row">
          {input}
          {del}
        </div>
      ) as HTMLDivElement
      parent.appendChild(row)
    })

    const add = (<button class="settings-inline-btn">+ Add feature</button>) as HTMLButtonElement
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
      const title = (<span class="app-card-title">{rc.name || '(unnamed command)'}</span>) as HTMLSpanElement
      const del = (
        <button class="app-del" title="Remove command">
          ✕
        </button>
      ) as HTMLButtonElement
      del.addEventListener('click', () => {
        p.runCommands = (p.runCommands ?? []).filter((x) => x !== rc)
        persistence.save()
        renderDetail()
      })
      const card = (
        <div class="app-card">
          <div class="app-card-head">
            {title}
            {del}
          </div>
        </div>
      ) as HTMLDivElement
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
    const add = (<button class="settings-inline-btn">+ Add command</button>) as HTMLButtonElement
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
          const wtCb = (<input type="text" />) as HTMLInputElement
          wtCb.type = 'checkbox'
          wtCb.checked = !!p.supportWorktree
          wtCb.style.marginRight = '8px'
          const wtLabel = (
            <label style={{ cursor: 'pointer' }}>
              {wtCb}
              <span>Support worktrees (list git worktrees as folders)</span>
            </label>
          ) as HTMLLabelElement
          const wtField = (<div class="field">{wtLabel}</div>) as HTMLDivElement
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

    const addSub = (<button class="settings-inline-btn">+ Add sub-project</button>) as HTMLButtonElement
    addSub.addEventListener('click', () => {
      const child = makeProject(uid('p'), 'New sub-project', '')
      p.children.push(child)
      selected = child
      persistence.save()
      requestSidebar()
      renderTree()
      renderDetail()
    })
    const del = (
      <button class="settings-inline-btn project-del-btn">Delete project</button>
    ) as HTMLButtonElement
    del.addEventListener('click', () => {
      removeProject(state.tree, p)
      selected = flattenProjects(state.tree)[0] ?? null
      persistence.save()
      requestSidebar()
      renderTree()
      renderDetail()
    })
    const actions = (
      <div class="proj-detail-actions">
        {addSub}
        {del}
      </div>
    ) as HTMLDivElement
    detailCol.appendChild(actions)
  }

  renderEnvs()
  renderGroups()
  renderTree()
  renderDetail()
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
  const checkbox = (<input type="text" />) as HTMLInputElement
  checkbox.type = 'checkbox'
  checkbox.checked = !!p.iosApp
  checkbox.style.marginRight = '8px'
  const toggleLabel = (
    <label style={{ cursor: 'pointer' }}>
      {checkbox}
      <span>iOS app (show the worktree manager under this project)</span>
    </label>
  ) as HTMLLabelElement
  const toggleField = (<div class="field">{toggleLabel}</div>) as HTMLDivElement
  panel.appendChild(toggleField)

  const body = (<div />) as HTMLDivElement
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
    const addBtn = (<button class="settings-inline-btn">+ Add file</button>) as HTMLButtonElement
    body.appendChild(addBtn)
    const list = (<div class="palette-admin-list" />) as HTMLDivElement
    body.appendChild(list)

    const renderFiles = (): void => {
      list.replaceChildren()
      if (!cfg.copyFiles.length) {
        list.insertAdjacentHTML('beforeend', '<div class="field-hint">No files yet.</div>')
        return
      }
      cfg.copyFiles.forEach((rel, i) => {
        const del = (<button class="wt-act wt-remove">Delete</button>) as HTMLButtonElement
        del.addEventListener('click', () => {
          cfg.copyFiles.splice(i, 1)
          iosConfigRepo.set(p.id, cfg)
          renderFiles()
        })
        const row = (
          <div class="palette-admin-row">
            <span class="palette-admin-cmd">{rel}</span>
            {del}
          </div>
        ) as HTMLDivElement
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
