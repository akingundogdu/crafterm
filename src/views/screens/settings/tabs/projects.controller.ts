import { el } from '@views/lib/dom'
import { settings, state, requestSidebar, uid } from '@views/state/spine'
import { UITexts } from '@texts'
import { persistence } from '@repositories/persistence.service'
import { promptText } from '@views/components/dialog/prompt-text'
import { reconcileWorktrees, purgeWorktrees } from '@services/worktrees'
import { flattenProjects, removeProject } from '@views/catalog/catalog'
import { makeProject } from '../make-project'
import type { ProjectNode } from '@views/types/types'
import { buildSubTabs } from '../shared'
import { computeGroupOptions } from './projects.state'
import { buildAppsSection } from './components/apps-section'
import { buildFeaturesSection } from './components/features-section'
import { buildRunCommandsSection } from './components/run-commands-section'
import { buildIosConfigSection } from './components/ios-config-section'

export class ProjectsPanelController {
  private readonly panel: HTMLElement

  private envBar!: HTMLDivElement
  private groupBar!: HTMLDivElement
  private listCol!: HTMLDivElement
  private detailCol!: HTMLDivElement

  private selected: ProjectNode | null = null

  // Persist the active sub-tab index per project so re-renders (e.g. after
  // "Add command") don't kick the user back to the first sub-tab.
  private readonly activeSubTabIdx = new Map<string, number>()

  constructor(panel: HTMLElement) {
    this.panel = panel
  }

  build(): void {
    const { panel } = this
    panel.insertAdjacentHTML('beforeend', `<h3>${UITexts.Settings.projects.heading}</h3>`)

    const cb = el('input', {
      type: 'checkbox',
      onChange: () => {
        settings.askProjectOnNew = cb.checked
        persistence.save()
      }
    })
    cb.checked = settings.askProjectOnNew
    const ask = el('label', { class: 'checkbox-row' }, cb, UITexts.Settings.projects.askProject)
    panel.appendChild(ask)

    // ---- Global environments (dev/local/production) ----
    panel.insertAdjacentHTML('beforeend', `<div class="settings-subhead">${UITexts.Settings.projects.environments}</div>`)
    this.envBar = el('div', { class: 'env-bar' })
    panel.appendChild(this.envBar)

    // ---- Global workspace groups (used as the Group dropdown) ----
    panel.insertAdjacentHTML('beforeend', `<div class="settings-subhead">${UITexts.Settings.projects.groups}</div>`)
    this.groupBar = el('div', { class: 'env-bar' })
    panel.appendChild(this.groupBar)

    // ---- Catalog tree (left) + selected-project editor (right) ----
    this.listCol = el('div', { class: 'projects-md-list' })
    this.detailCol = el('div', { class: 'projects-md-detail' })
    const md = el('div', { class: 'projects-md' }, this.listCol, this.detailCol)
    panel.appendChild(md)

    this.selected = flattenProjects(state.tree)[0] ?? null

    this.renderEnvs()
    this.renderGroups()
    this.renderTree()
    this.renderDetail()
  }

  // A labeled field (input or textarea) appended to a given parent.
  // Pass `opts.options` to render the input as a datalist-backed combobox
  // (typed value is still free-form; the dropdown just suggests known entries).
  private field = (
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
    const wrap = el('div', { class: 'field' }, el('label', null, label), input)
    if (opts.options && input instanceof HTMLInputElement) {
      const listId = 'dl-' + Math.random().toString(36).slice(2, 9)
      input.setAttribute('list', listId)
      const dl = el('datalist', { id: listId })
      opts.options.forEach((v) => dl.appendChild(el('option', { value: v })))
      wrap.appendChild(dl)
    }
    parent.appendChild(wrap)
  }

  // A real dropdown field. `options` are the selectable values; the current
  // value is always present (legacy labels stay selectable). The empty option
  // (label `emptyLabel`) clears the value.
  private selectField = (
    parent: HTMLElement,
    label: string,
    value: string,
    emptyLabel: string,
    options: string[],
    onChange: (v: string) => void
  ): void => {
    const all = [...new Set([...options, ...(value ? [value] : [])])]
    const sel = el('select', { onChange: () => onChange(sel.value) })
    sel.appendChild(el('option', { value: '' }, emptyLabel))
    all.forEach((v) => sel.appendChild(el('option', { value: v }, v)))
    sel.value = value
    parent.appendChild(el('div', { class: 'field' }, el('label', null, label), sel))
  }

  private renderEnvs = (): void => {
    const { envBar } = this
    envBar.replaceChildren()
    settings.environments.forEach((name, i) => {
      const x = el(
        'button',
        {
          class: 'env-chip-x',
          title: 'Remove environment',
          onClick: () => {
            settings.environments.splice(i, 1)
            persistence.save()
            this.renderEnvs()
            this.renderDetail()
          }
        },
        '×'
      )
      const chip = el('span', { class: 'settings-env-chip' }, el('span', null, name), x)
      envBar.appendChild(chip)
    })
    const add = el(
      'button',
      {
        class: 'settings-inline-btn env-add',
        onClick: () => {
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
            this.renderEnvs()
            this.renderDetail()
          })()
        }
      },
      '+ Environment'
    )
    envBar.appendChild(add)
  }

  private renderGroups = (): void => {
    const { groupBar } = this
    groupBar.replaceChildren()
    const known = computeGroupOptions()
    known.forEach((name) => {
      const x = el(
        'button',
        {
          class: 'env-chip-x',
          title: 'Remove group from suggestions (does not unset on existing projects)',
          onClick: () => {
            settings.groups = settings.groups.filter((g) => g !== name)
            persistence.save()
            this.renderGroups()
            this.renderDetail()
          }
        },
        '×'
      )
      const chip = el('span', { class: 'settings-env-chip' }, el('span', null, name), x)
      groupBar.appendChild(chip)
    })
    const add = el(
      'button',
      {
        class: 'settings-inline-btn env-add',
        onClick: () => {
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
            this.renderGroups()
            this.renderDetail()
          })()
        }
      },
      '+ Group'
    )
    groupBar.appendChild(add)
  }

  private renderTree = (): void => {
    const { listCol } = this
    listCol.replaceChildren()
    const topProjects = state.tree.filter((n): n is ProjectNode => n.kind === 'project')
    if (!topProjects.length) {
      listCol.insertAdjacentHTML('beforeend', '<div class="field-hint">No projects yet.</div>')
    }
    const renderRows = (projects: ProjectNode[], depth: number): void => {
      projects.forEach((p) => {
        const row = el(
          'div',
          {
            class: 'proj-li' + (p === this.selected ? ' active' : ''),
            onClick: () => {
              this.selected = p
              this.renderTree()
              this.renderDetail()
            }
          },
          el('span', { class: 'proj-li-name' }, p.name || '(untitled)'),
          p.group ? el('span', { class: 'proj-li-group' }, p.group) : null,
          p.apps?.length ? el('span', { class: 'proj-li-apps' }, p.apps.length === 1 ? '1 app' : `${p.apps.length} apps`) : null
        )
        row.style.paddingLeft = 8 + depth * 14 + 'px'
        listCol.appendChild(row)
        const subProjects = p.children.filter((c): c is ProjectNode => c.kind === 'project')
        if (subProjects.length) renderRows(subProjects, depth + 1)
      })
    }
    renderRows(topProjects, 0)

    const addBtn = el(
      'button',
      {
        class: 'settings-inline-btn',
        onClick: () => {
          const proj = makeProject(uid('p'), 'New project', '')
          state.tree.push(proj)
          this.selected = proj
          persistence.save()
          requestSidebar()
          this.renderTree()
          this.renderDetail()
        }
      },
      '+ Add project'
    )
    listCol.appendChild(addBtn)
  }

  private renderDetail = (): void => {
    const { detailCol } = this
    detailCol.replaceChildren()
    const p = this.selected
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
        build: (host) => {
          this.field(host, 'Name', p.name, 'Movve', (v) => {
            p.name = v.trim()
            this.renderTree()
            requestSidebar()
            persistence.save()
          })
          this.field(host, 'Path', p.path, '~/code/movve', (v) => {
            p.path = v.trim()
            requestSidebar()
            persistence.save()
          })
          this.selectField(
            host,
            'Group (workspace)',
            p.group ?? '',
            '(Ungrouped)',
            computeGroupOptions(),
            (v) => {
              const g = v.trim()
              p.group = g || undefined
              if (g && !settings.groups.includes(g)) settings.groups.push(g)
              this.renderTree()
              this.renderGroups()
              requestSidebar()
              persistence.save()
            }
          )
          this.field(host, 'Command', p.command ?? '', 'claude (run on open, optional)', (v) => {
            p.command = v.trim() || undefined
            persistence.save()
          })
          this.field(
            host,
            'Startup command',
            p.startup ?? '',
            'run in every terminal opened inside (optional)',
            (v) => {
              p.startup = v.trim() || undefined
              persistence.save()
            }
          )
          this.field(host, 'Shell', p.shell ?? '', '/bin/zsh (override, optional)', (v) => {
            p.shell = v.trim() || undefined
            persistence.save()
          })
          this.field(
            host,
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
          const wtCb = el('input', {
            type: 'checkbox',
            onChange: () => {
              p.supportWorktree = wtCb.checked
              persistence.save()
              requestSidebar()
              if (p.supportWorktree) void reconcileWorktrees()
              else purgeWorktrees(p)
            }
          })
          wtCb.checked = !!p.supportWorktree
          wtCb.style.marginRight = '8px'
          const wtLabel = el('label', null, wtCb, el('span', null, 'Support worktrees (list git worktrees as folders)'))
          wtLabel.style.cursor = 'pointer'
          host.appendChild(el('div', { class: 'field' }, wtLabel))
        }
      },
      {
        label: 'Environment',
        build: (host) => {
          this.field(
            host,
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
        build: (host) => buildAppsSection({ project: p, parent: host, field: this.field, uid, renderTree: this.renderTree, renderDetail: this.renderDetail })
      },
      {
        label: 'Features',
        build: (host) => buildFeaturesSection({ project: p, parent: host, uid, renderTree: this.renderTree, renderDetail: this.renderDetail })
      },
      {
        label: 'Run commands',
        build: (host) => buildRunCommandsSection({ project: p, parent: host, field: this.field, uid, renderDetail: this.renderDetail })
      },
      { label: 'iOS', build: (host) => buildIosConfigSection(p, host) }
    ], {
      initialIndex: this.activeSubTabIdx.get(subTabKey) ?? 0,
      onTabChange: (i) => this.activeSubTabIdx.set(subTabKey, i)
    })

    const addSub = el(
      'button',
      {
        class: 'settings-inline-btn',
        onClick: () => {
          const child = makeProject(uid('p'), 'New sub-project', '')
          p.children.push(child)
          this.selected = child
          persistence.save()
          requestSidebar()
          this.renderTree()
          this.renderDetail()
        }
      },
      '+ Add sub-project'
    )
    const del = el(
      'button',
      {
        class: 'settings-inline-btn project-del-btn',
        onClick: () => {
          removeProject(state.tree, p)
          this.selected = flattenProjects(state.tree)[0] ?? null
          persistence.save()
          requestSidebar()
          this.renderTree()
          this.renderDetail()
        }
      },
      'Delete project'
    )
    detailCol.appendChild(el('div', { class: 'proj-detail-actions' }, addSub, del))
  }
}
