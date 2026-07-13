import { Component } from '@geajs/core'
import { settings, state, requestSidebar, uid } from '@views/state/spine'
import { UITexts } from '@texts'
import { persistence } from '@repositories/persistence.service'
import { promptText } from '@views/components/dialog/prompt-text'
import { flattenProjects, removeProject } from '@views/catalog/catalog'
import { makeProject } from '../make-project'
import type { ProjectNode } from '@views/types/types'
import type { SubTab } from '../shared.types'
import { computeGroupOptions } from './projects.store'
import { flattenTreeRows } from './components/project-tree.store'
import { buildAppsSection } from './components/apps-section'
import { buildFeaturesSection } from './components/features-section'
import { buildRunCommandsSection } from './components/run-commands-section'
import { buildIosConfigSection } from './components/ios-config-section'
import ChipBar from './components/chip-bar'
import ProjectTree from './components/project-tree'
import ProjectDetail from './components/project-detail'
import GeneralTab from './components/general-tab'
import EnvironmentTab from './components/environment-tab'
import store from './projects.store'

// Projects settings panel — fully store-driven (no controller). ProjectsPanel is the
// static shell mounted once; the four columns (env chips / group chips / tree / detail)
// are reactive JSX children that read `store.rev` (via `data-rev`) and re-render on any
// bump — replacing the controller's imperative renderEnvs/renderGroups/renderTree/
// renderDetail seams. Callbacks mutate settings/tree then bump the store. The detail is
// keyed by `store.detailKey` so a fresh SubTabs mounts only on selection / env / group-
// chip / structural change, never on an in-place General/Environment field edit (those
// bump `rev` alone). The active sub-tab index per project survives re-renders via the
// module-level map (cleared on each panel open).
const activeSubTabIdx = new Map<string, number>()

function selectedProject(): ProjectNode | null {
  return flattenProjects(state.tree).find((p) => p.id === store.selectedId) ?? null
}

// The environment chip strip (reactive).
class EnvChips extends Component {
  template() {
    return (
      <div style={{ display: 'contents' }} data-rev={String(store.rev)}>
        <ChipBar
          names={[...settings.environments]}
          removeTitle="Remove environment"
          addLabel="+ Environment"
          onRemove={(name: string) => {
            settings.environments = settings.environments.filter((n) => n !== name)
            persistence.save()
            store.bumpDetail()
          }}
          onAdd={() => {
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
              store.bumpDetail()
            })()
          }}
        />
      </div>
    )
  }
}

// The group chip strip (reactive).
class GroupChips extends Component {
  template() {
    return (
      <div style={{ display: 'contents' }} data-rev={String(store.rev)}>
        <ChipBar
          names={computeGroupOptions()}
          removeTitle="Remove group from suggestions (does not unset on existing projects)"
          addLabel="+ Group"
          onRemove={(name: string) => {
            settings.groups = settings.groups.filter((g) => g !== name)
            persistence.save()
            store.bumpDetail()
          }}
          onAdd={() => {
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
              store.bumpDetail()
            })()
          }}
        />
      </div>
    )
  }
}

// The left column: the project tree (reactive).
class TreeCol extends Component {
  template() {
    const topProjects = state.tree.filter((n): n is ProjectNode => n.kind === 'project')
    return (
      <div style={{ display: 'contents' }} data-rev={String(store.rev)}>
        <ProjectTree
          rows={flattenTreeRows(store.selectedId)}
          hasProjects={topProjects.length > 0}
          onSelect={(id: string) => store.select(id)}
          onAdd={() => {
            const proj = makeProject(uid('p'), 'New project', '')
            state.tree.push(proj)
            persistence.save()
            requestSidebar()
            store.select(proj.id)
          }}
        />
      </div>
    )
  }
}

// The right column: the selected project's detail (reactive), keyed so a fresh SubTabs
// mounts only when the detail must truly rebuild.
class DetailCol extends Component {
  template() {
    // Subscription comes from `data-rev` read into the output below (a bare `void`
    // read is not tracked by the gea compiler).
    const p = selectedProject()
    if (!p) {
      return (
        <div style={{ display: 'contents' }} data-rev={String(store.rev)}>
          <div class="field-hint">Select a project on the left, or add one.</div>
        </div>
      )
    }

    const tabs: SubTab[] = [
      {
        label: 'General',
        build: (host) =>
          new GeneralTab(p, { renderTree: () => store.bump(), renderGroups: () => store.bump() }).render(host)
      },
      { label: 'Environment', build: (host) => new EnvironmentTab(p).render(host) },
      {
        label: 'Apps',
        build: (host) =>
          buildAppsSection({
            projectId: p.id,
            parent: host,
            environments: [...settings.environments],
            uid,
            renderTree: () => store.bump()
          })
      },
      {
        label: 'Features',
        build: (host) => buildFeaturesSection({ projectId: p.id, parent: host, uid, renderTree: () => store.bump() })
      },
      { label: 'Run commands', build: (host) => buildRunCommandsSection({ projectId: p.id, parent: host, uid }) },
      { label: 'iOS', build: (host) => buildIosConfigSection(p.id, host) }
    ]

    // Render ProjectDetail through a single-element keyed `.map()` (not a bare
    // single-child `key=`): gea only honors key-driven remounts on array
    // reconciliation, so this rotates a fresh ProjectDetail (with a fresh SubTabs)
    // when `detailKey` changes — selection / env / group-chip / structural — and
    // reuses it (SubTabs preserved) when only `rev` bumped (an in-place field edit).
    return (
      <div style={{ display: 'contents' }} data-rev={String(store.rev)}>
        {[store.detailKey].map((k) => (
          <ProjectDetail
            key={k}
            tabs={tabs}
            initialIndex={activeSubTabIdx.get(p.id) ?? 0}
            onTabChange={(i: number) => activeSubTabIdx.set(p.id, i)}
            onAddSub={() => {
              const child = makeProject(uid('p'), 'New sub-project', '')
              p.children.push(child)
              persistence.save()
              requestSidebar()
              store.select(child.id)
            }}
            onDelete={() => {
              removeProject(state.tree, p)
              persistence.save()
              requestSidebar()
              store.select(flattenProjects(state.tree)[0]?.id ?? null)
            }}
          />
        ))}
      </div>
    )
  }
}

// The static shell: heading, "ask which project" checkbox, the Environments / Groups
// sub-heads with their reactive chip strips, and the two-column list / detail layout.
// Mounted once; the reactive children re-render themselves off the store.
class ProjectsPanel extends Component {
  private askCb: HTMLInputElement | null = null

  onAfterRender(): void {
    if (this.askCb) this.askCb.checked = settings.askProjectOnNew
  }

  template() {
    return (
      <div style={{ display: 'contents' }}>
        <h3>{UITexts.Settings.projects.heading}</h3>
        <label class="checkbox-row">
          <input
            type="checkbox"
            ref={this.askCb}
            onChange={(e: Event) => {
              settings.askProjectOnNew = (e.target as HTMLInputElement).checked
              persistence.save()
            }}
          />
          {UITexts.Settings.projects.askProject}
        </label>
        <div class="settings-subhead">{UITexts.Settings.projects.environments}</div>
        <div class="env-bar">
          <EnvChips />
        </div>
        <div class="settings-subhead">{UITexts.Settings.projects.groups}</div>
        <div class="env-bar">
          <GroupChips />
        </div>
        <div class="projects-md">
          <div class="projects-md-list">
            <TreeCol />
          </div>
          <div class="projects-md-detail">
            <DetailCol />
          </div>
        </div>
      </div>
    )
  }
}

export function buildProjectsPanel(panel: HTMLElement): void {
  activeSubTabIdx.clear()
  store.selectedId = flattenProjects(state.tree)[0]?.id ?? null
  store.detailEpoch = 0
  store.rev = 0
  new ProjectsPanel().render(panel)
}
