import { Component } from '@geajs/core'
import { UITexts } from '@texts'
import type { Application } from '@views/types/types'
import { sanitizeBranch } from '../project.store'
import store from '../feature-setup.store'
import EnvironmentChips from './environment-chips'
import ApplicationCheckboxRow from './application-checkbox-row'

// The chrome + behaviour the feature-setup view needs, supplied by the controller.
// `emptyText`, when non-empty, is shown as a hint under the heading. `onCreate`
// receives the validated branch / base / chosen-apps; the controller runs
// createFeature + close.
export interface FeatureSetupDeps {
  title: string
  hasApps: boolean
  emptyText: string
  environments: string[]
  close: () => void
  onCreate: (params: { branch: string; base: string; chosen: { app: Application; worktree: boolean }[] }) => void
}

// Reactive body of the feature modal's application section: environment chips + the
// per-app include/worktree checkbox list. Rendered as a JSX child of
// FeatureSetupView so gea tracks its store reads and re-renders it on every
// environment switch / checkbox toggle — the board pattern. The parent shell holds
// the text inputs and renders once, so they are never wiped by these re-renders.
class FeatureAppsSection extends Component {
  declare props: { environments: string[] }

  template({ environments }: this['props']) {
    const env = store.env
    return (
      <div class="feature-apps-section">
        <div class="reminder-label">Environment</div>
        <EnvironmentChips environments={environments} selected={env} onSelect={(name: string) => store.setEnv(name)} />
        <div class="reminder-label">Applications (✓ include · ⑂ worktree)</div>
        <div class="run-app-list">
          {store.apps.map((app, i) => (
            <ApplicationCheckboxRow
              key={app.name + ' ' + i}
              name={app.name}
              cmd={(app.commands?.[env] ?? '').trim()}
              env={env}
              withWorktree={true}
              checked={!!store.incl[i]}
              onToggle={(v: boolean) => store.setIncl(i, v)}
              worktreeChecked={!!store.wt[i]}
              onToggleWorktree={(v: boolean) => store.setWt(i, v)}
            />
          ))}
        </div>
      </div>
    )
  }
}

// Thin shell for the feature-setup modal, mounted imperatively into the shared
// overlay modal. The name / branch / base inputs are UNCONTROLLED (read from the
// DOM at commit via property refs) and live here in the single-render shell so the
// reactive app-section re-renders never wipe them. `deps` arrive via the
// constructor into a plain field.
export default class FeatureSetupView extends Component {
  private readonly deps: FeatureSetupDeps

  nameInput: HTMLInputElement | null = null
  branchInput: HTMLInputElement | null = null
  baseInput: HTMLInputElement | null = null
  private branchEdited = false

  constructor(deps: FeatureSetupDeps) {
    super()
    this.deps = deps
  }

  // Seed the base branch + focus the name input once after mount. Guarded so a
  // defensive re-run is harmless.
  onAfterRender(): void {
    if (this.baseInput && this.baseInput.value === '') this.baseInput.value = 'main'
    this.nameInput?.focus()
  }

  private onName = (): void => {
    if (!this.branchEdited && this.branchInput && this.nameInput) {
      this.branchInput.value = sanitizeBranch(this.nameInput.value)
    }
  }

  private onBranch = (): void => {
    this.branchEdited = true
  }

  private doCreate = (): void => {
    const branch = sanitizeBranch((this.branchInput?.value || this.nameInput?.value) ?? '')
    if (!branch) return
    const chosen = store.chosen()
    if (!chosen.length) return
    this.deps.onCreate({ branch, base: this.baseInput?.value ?? '', chosen })
  }

  template() {
    const { deps } = this
    return (
      <div class="project-picker feature-setup">
        <h2>{deps.title}</h2>
        {!deps.hasApps ? <div class="empty-hint">{deps.emptyText}</div> : null}
        <div class="reminder-label">Feature name</div>
        <input class="reminder-input" placeholder="maxi onboarding" ref={this.nameInput} onInput={this.onName} />
        <div class="reminder-label">Branch</div>
        <input class="reminder-input" placeholder="maxi-onboarding" ref={this.branchInput} onInput={this.onBranch} />
        <div class="reminder-label">Base branch</div>
        <input class="reminder-input" ref={this.baseInput} />
        {deps.hasApps ? <FeatureAppsSection environments={deps.environments} /> : null}
        <div class="modal-actions">
          <button onClick={() => deps.close()}>{UITexts.Pickers.project.cancel}</button>
          <button class="button-primary" onClick={this.doCreate}>
            Create
          </button>
        </div>
      </div>
    )
  }
}
