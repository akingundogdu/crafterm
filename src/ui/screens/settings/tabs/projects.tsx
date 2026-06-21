import { settings, state, requestSidebar, uid } from '@ui/state/state'
import { UITexts } from '@texts'
import { persistence } from '@repositories/persistence.service'
import { promptText } from '@ui/components/dialog/dialog'
import { reconcileWorktrees, purgeWorktrees } from '@services/worktrees'
import { flattenProjects, removeProject } from '@ui/catalog/catalog'
import { makeProject } from '@ui/tree/tree'
import { FormField } from '@ui/components'
import type { ProjectNode } from '@ui/types/types'
import { buildSubTabs } from '../shared'
import { computeGroupOptions } from './projects.state'
import { buildAppsSection } from './components/apps-section'
import { buildFeaturesSection } from './components/features-section'
import { buildRunCommandsSection } from './components/run-commands-section'
import { buildIosConfigSection } from './components/ios-config-section'

export function buildProjectsPanel(panel: HTMLElement): void {
  panel.insertAdjacentHTML('beforeend', `<h3>${UITexts.Settings.projects.heading}</h3>`)

  const cb = (
    <input
      type="text"
      onChange={() => {
        settings.askProjectOnNew = cb.checked
        persistence.save()
      }}
    />
  ) as HTMLInputElement
  cb.type = 'checkbox'
  cb.checked = settings.askProjectOnNew
  const ask = (
    <label class="checkbox-row">
      {cb}
      {UITexts.Settings.projects.askProject}
    </label>
  ) as HTMLLabelElement
  panel.appendChild(ask)

  // ---- Global environments (dev/local/production) ----
  panel.insertAdjacentHTML('beforeend', `<div class="settings-subhead">${UITexts.Settings.projects.environments}</div>`)
  const envBar = (<div class="env-bar" />) as HTMLDivElement
  panel.appendChild(envBar)

  // ---- Global workspace groups (used as the Group dropdown) ----
  panel.insertAdjacentHTML('beforeend', `<div class="settings-subhead">${UITexts.Settings.projects.groups}</div>`)
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
    const input = opts.textarea
      ? document.createElement('textarea')
      : document.createElement('input')
    if (input instanceof HTMLInputElement) input.type = 'text'
    if (input instanceof HTMLTextAreaElement) input.rows = opts.rows ?? 3
    input.value = value
    input.placeholder = placeholder
    input.addEventListener('change', () => onChange(input.value))
    const wrap = (<FormField label={label}>{input}</FormField>) as HTMLDivElement
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
    const all = [...new Set([...options, ...(value ? [value] : [])])]
    const sel = (
      <select onChange={() => onChange(sel.value)}>
        <option value="">{emptyLabel}</option>
        {all.map((v) => (<option value={v}>{v}</option>))}
      </select>
    ) as HTMLSelectElement
    sel.value = value
    const wrap = (<FormField label={label}>{sel}</FormField>) as HTMLDivElement
    parent.appendChild(wrap)
  }

  const renderEnvs = (): void => {
    envBar.replaceChildren()
    settings.environments.forEach((name, i) => {
      const x = (
        <button
          class="env-chip-x"
          title="Remove environment"
          onClick={() => {
            settings.environments.splice(i, 1)
            persistence.save()
            renderEnvs()
            renderDetail()
          }}
        >
          ×
        </button>
      ) as HTMLButtonElement
      const chip = (
        <span class="settings-env-chip">
          <span>{name}</span>
          {x}
        </span>
      ) as HTMLSpanElement
      envBar.appendChild(chip)
    })
    const add = (
      <button
        class="settings-inline-btn env-add"
        onClick={() => {
          void (async () => {
            const name = await promptText({
              title: UITexts.Settings.projects.newEnvironment,
              label: UITexts.Settings.projects.name,
              placeholder: 'staging',
              confirmText: UITexts.Settings.projects.add
            })
            if (!name || settings.environments.includes(name)) return
            settings.environments.push(name)
            persistence.save()
            renderEnvs()
            renderDetail()
          })()
        }}
      >
        + Environment
      </button>
    ) as HTMLButtonElement
    envBar.appendChild(add)
  }

  const renderGroups = (): void => {
    groupBar.replaceChildren()
    const known = computeGroupOptions()
    known.forEach((name) => {
      const x = (
        <button
          class="env-chip-x"
          title="Remove group from suggestions (does not unset on existing projects)"
          onClick={() => {
            settings.groups = settings.groups.filter((g) => g !== name)
            persistence.save()
            renderGroups()
            renderDetail()
          }}
        >
          ×
        </button>
      ) as HTMLButtonElement
      const chip = (
        <span class="settings-env-chip">
          <span>{name}</span>
          {x}
        </span>
      ) as HTMLSpanElement
      groupBar.appendChild(chip)
    })
    const add = (
      <button
        class="settings-inline-btn env-add"
        onClick={() => {
          void (async () => {
            const name = await promptText({
              title: UITexts.Settings.projects.newGroup,
              label: UITexts.Settings.projects.name,
              placeholder: 'work',
              confirmText: UITexts.Settings.projects.add
            })
            const g = (name ?? '').trim()
            if (!g || settings.groups.includes(g)) return
            settings.groups.push(g)
            persistence.save()
            renderGroups()
            renderDetail()
          })()
        }}
      >
        + Group
      </button>
    ) as HTMLButtonElement
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
            onClick={() => {
              selected = p
              renderTree()
              renderDetail()
            }}
          >
            <span class="proj-li-name">{p.name || '(untitled)'}</span>
            {p.group && <span class="proj-li-group">{p.group}</span>}
            {!!p.apps?.length && (
              <span class="proj-li-apps">{p.apps.length === 1 ? '1 app' : `${p.apps.length} apps`}</span>
            )}
          </div>
        ) as HTMLDivElement
        listCol.appendChild(row)
        const subProjects = p.children.filter((c): c is ProjectNode => c.kind === 'project')
        if (subProjects.length) renderRows(subProjects, depth + 1)
      })
    }
    renderRows(topProjects, 0)

    const addBtn = (
      <button
        class="settings-inline-btn"
        onClick={() => {
          const proj = makeProject(uid('p'), 'New project', '')
          state.tree.push(proj)
          selected = proj
          persistence.save()
          requestSidebar()
          renderTree()
          renderDetail()
        }}
      >
        + Add project
      </button>
    ) as HTMLButtonElement
    listCol.appendChild(addBtn)
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
            computeGroupOptions(),
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
          const wtCb = (
            <input
              type="text"
              onChange={() => {
                p.supportWorktree = wtCb.checked
                persistence.save()
                requestSidebar()
                if (p.supportWorktree) void reconcileWorktrees()
                else purgeWorktrees(p)
              }}
            />
          ) as HTMLInputElement
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
      {
        label: 'Apps',
        build: (el) => buildAppsSection({ project: p, parent: el, field, uid, renderTree, renderDetail })
      },
      {
        label: 'Features',
        build: (el) => buildFeaturesSection({ project: p, parent: el, uid, renderTree, renderDetail })
      },
      {
        label: 'Run commands',
        build: (el) => buildRunCommandsSection({ project: p, parent: el, field, uid, renderDetail })
      },
      { label: 'iOS', build: (el) => buildIosConfigSection(p, el) }
    ], {
      initialIndex: activeSubTabIdx.get(subTabKey) ?? 0,
      onTabChange: (i) => activeSubTabIdx.set(subTabKey, i)
    })

    const addSub = (
      <button
        class="settings-inline-btn"
        onClick={() => {
          const child = makeProject(uid('p'), 'New sub-project', '')
          p.children.push(child)
          selected = child
          persistence.save()
          requestSidebar()
          renderTree()
          renderDetail()
        }}
      >
        + Add sub-project
      </button>
    ) as HTMLButtonElement
    const del = (
      <button
        class="settings-inline-btn project-del-btn"
        onClick={() => {
          removeProject(state.tree, p)
          selected = flattenProjects(state.tree)[0] ?? null
          persistence.save()
          requestSidebar()
          renderTree()
          renderDetail()
        }}
      >
        Delete project
      </button>
    ) as HTMLButtonElement
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
