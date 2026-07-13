import './pr.css'
import { Component } from '@geajs/core'
import { UITexts } from '@texts'
import { runInSplit } from '@views/commands/commands'
import store from './pr.store'
import { showProjectPicker } from './components/project-picker'
import SectionRow from './components/section-row'

// gea PR / Deployments panel: toolbar (create/refresh) + sub-tabs (PRs |
// Deployments) + nested scope tabs (Current | All projects) + a reactive,
// per-row keyed list driven by store.sections. Replaces the legacy PrController's
// renderPr() closure. The root is display:contents so children lay out as direct
// children of the #notif-pr-view host. The background poll lives in the store and
// is started/stopped from the legacy entry's prTabVisible().
export default class Pr extends Component {
  created(): void {
    void store.reload()
  }

  template() {
    const scope = store.scope
    return (
      <div class="pr-root" style={{ display: 'contents' }}>
        <div class="pr-toolbar">
          {store.subTab === 'prs' && (
            <button
              class="settings-inline-btn"
              title={UITexts.Pr.createPrTitle}
              onClick={() => void runInSplit('gh pr create --web')}
            >
              {UITexts.Pr.createPr}
            </button>
          )}
          <button class="settings-inline-btn" title={UITexts.Pr.refreshTitle} onClick={() => void store.reload()}>
            ⟳
          </button>
        </div>

        <div class="pr-subtabs">
          <button
            class={'pr-subtab' + (store.subTab === 'prs' ? ' active' : '')}
            onClick={() => store.setSubTab('prs')}
          >
            {UITexts.Pr.subPrs}
          </button>
          <button
            class={'pr-subtab' + (store.subTab === 'deploys' ? ' active' : '')}
            onClick={() => store.setSubTab('deploys')}
          >
            {UITexts.Pr.subDeploys}
          </button>
        </div>

        <div class="pr-subtabs pr-scopetabs">
          <button
            class={'pr-subtab' + (scope === 'current' ? ' active' : '')}
            onClick={() => store.setScope('current')}
          >
            {UITexts.Pr.scopeCurrent}
          </button>
          <button class={'pr-subtab' + (scope === 'all' ? ' active' : '')} onClick={() => store.setScope('all')}>
            {UITexts.Pr.scopeAll}
          </button>
        </div>

        <div class="pr-list">
          {store.showAddProjects && (
            <div class="pr-allbar">
              <button
                class="settings-inline-btn"
                title={UITexts.Pr.addProjectsTitle}
                onClick={() => void showProjectPicker(() => void store.reload())}
              >
                {UITexts.Pr.addProjects}
              </button>
            </div>
          )}
          {store.loading && <div class="notif-empty">{UITexts.Pr.loading}</div>}
          {store.sections.map((s) => (
            <SectionRow key={s.key} section={s} />
          ))}
        </div>
      </div>
    )
  }
}
