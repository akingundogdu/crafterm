import { settings, state, requestSidebar, uid } from '@views/state/spine'
import { UITexts } from '@texts'
import { persistence } from '@repositories/persistence.service'
import { promptText } from '@views/components/dialog/prompt-text'
import { flattenProjects, removeProject } from '@views/catalog/catalog'
import { makeProject } from '../make-project'
import type { ProjectNode } from '@views/types/types'
import type { SubTab } from '../shared.types'
import { computeGroupOptions } from './projects.state'
import { flattenTreeRows } from './components/project-tree.state'
import { buildAppsSection } from './components/apps-section'
import { buildFeaturesSection } from './components/features-section'
import { buildRunCommandsSection } from './components/run-commands-section'
import { buildIosConfigSection } from './components/ios-config-section'
import ProjectsSkeleton from './components/projects-skeleton'
import ChipBar from './components/chip-bar'
import ProjectTree from './components/project-tree'
import ProjectDetail from './components/project-detail'
import GeneralTab from './components/general-tab'
import EnvironmentTab from './components/environment-tab'

// Orchestrates the Projects settings panel. It owns no DOM building of its own — the
// skeleton, chip bars, catalog tree, and per-project detail are all gea Components
// mounted into hosts (§views: every DOM-building unit is a gea .tsx Component). The
// controller keeps only selection state + the imperative re-render seams (renderEnvs /
// renderGroups / renderTree / renderDetail) that replace a host's children with a
// freshly built gea view — mirroring the legacy replaceChildren rebuilds.
export class ProjectsPanelController {
  private readonly panel: HTMLElement

  private envBar!: HTMLElement
  private groupBar!: HTMLElement
  private listCol!: HTMLElement
  private detailCol!: HTMLElement

  private selected: ProjectNode | null = null

  // Persist the active sub-tab index per project so re-renders (e.g. after
  // "Add command") don't kick the user back to the first sub-tab.
  private readonly activeSubTabIdx = new Map<string, number>()

  constructor(panel: HTMLElement) {
    this.panel = panel
  }

  build(): void {
    const { panel } = this
    new ProjectsSkeleton({
      heading: UITexts.Settings.projects.heading,
      askProjectText: UITexts.Settings.projects.askProject,
      environmentsText: UITexts.Settings.projects.environments,
      groupsText: UITexts.Settings.projects.groups,
      askProjectInitial: settings.askProjectOnNew,
      onAskProjectChange: (checked) => {
        settings.askProjectOnNew = checked
        persistence.save()
      }
    }).render(panel)

    // The skeleton lays out two `.env-bar` hosts (environments, then groups) plus the
    // list / detail columns; grab them from the DOM to fill imperatively below.
    const envBars = panel.querySelectorAll<HTMLElement>('.env-bar')
    this.envBar = envBars[0]
    this.groupBar = envBars[1]
    this.listCol = panel.querySelector<HTMLElement>('.projects-md-list')!
    this.detailCol = panel.querySelector<HTMLElement>('.projects-md-detail')!

    this.selected = flattenProjects(state.tree)[0] ?? null

    this.renderEnvs()
    this.renderGroups()
    this.renderTree()
    this.renderDetail()
  }

  private renderEnvs = (): void => {
    this.envBar.replaceChildren()
    new ChipBar({
      names: settings.environments,
      removeTitle: 'Remove environment',
      addLabel: '+ Environment',
      onRemove: (name) => {
        settings.environments = settings.environments.filter((n) => n !== name)
        persistence.save()
        this.renderEnvs()
        this.renderDetail()
      },
      onAdd: () => {
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
    }).render(this.envBar)
  }

  private renderGroups = (): void => {
    this.groupBar.replaceChildren()
    new ChipBar({
      names: computeGroupOptions(),
      removeTitle: 'Remove group from suggestions (does not unset on existing projects)',
      addLabel: '+ Group',
      onRemove: (name) => {
        settings.groups = settings.groups.filter((g) => g !== name)
        persistence.save()
        this.renderGroups()
        this.renderDetail()
      },
      onAdd: () => {
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
    }).render(this.groupBar)
  }

  private renderTree = (): void => {
    this.listCol.replaceChildren()
    const topProjects = state.tree.filter((n): n is ProjectNode => n.kind === 'project')
    new ProjectTree({
      rows: flattenTreeRows(this.selected?.id ?? null),
      hasProjects: topProjects.length > 0,
      onSelect: (id) => {
        this.selected = flattenProjects(state.tree).find((p) => p.id === id) ?? null
        this.renderTree()
        this.renderDetail()
      },
      onAdd: () => {
        const proj = makeProject(uid('p'), 'New project', '')
        state.tree.push(proj)
        this.selected = proj
        persistence.save()
        requestSidebar()
        this.renderTree()
        this.renderDetail()
      }
    }).render(this.listCol)
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
    const tabs: SubTab[] = [
      { label: 'General', build: (host) => new GeneralTab(p, { renderTree: this.renderTree, renderGroups: this.renderGroups }).render(host) },
      { label: 'Environment', build: (host) => new EnvironmentTab(p).render(host) },
      {
        label: 'Apps',
        build: (host) =>
          buildAppsSection({
            projectId: p.id,
            parent: host,
            environments: [...settings.environments],
            uid,
            renderTree: this.renderTree
          })
      },
      {
        label: 'Features',
        build: (host) => buildFeaturesSection({ projectId: p.id, parent: host, uid, renderTree: this.renderTree })
      },
      { label: 'Run commands', build: (host) => buildRunCommandsSection({ projectId: p.id, parent: host, uid }) },
      { label: 'iOS', build: (host) => buildIosConfigSection(p.id, host) }
    ]

    new ProjectDetail({
      tabs,
      initialIndex: this.activeSubTabIdx.get(subTabKey) ?? 0,
      onTabChange: (i) => this.activeSubTabIdx.set(subTabKey, i),
      onAddSub: () => {
        const child = makeProject(uid('p'), 'New sub-project', '')
        p.children.push(child)
        this.selected = child
        persistence.save()
        requestSidebar()
        this.renderTree()
        this.renderDetail()
      },
      onDelete: () => {
        removeProject(state.tree, p)
        this.selected = flattenProjects(state.tree)[0] ?? null
        persistence.save()
        requestSidebar()
        this.renderTree()
        this.renderDetail()
      }
    }).render(detailCol)
  }
}
