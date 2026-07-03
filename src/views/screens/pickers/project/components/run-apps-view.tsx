import { Component } from '@geajs/core'
import { UITexts } from '@texts'
import store from '../run-apps.store'
import EnvironmentChips from './environment-chips'
import ApplicationCheckboxRow from './application-checkbox-row'

// The chrome + behaviour the run-apps view needs, supplied by the controller.
// `emptyText`, when set, renders the disabled "no apps / no environments" layout.
// The handlers close over the controller's project + close state.
export interface RunAppsDeps {
  title: string
  emptyText: string | null
  environments: string[]
  close: () => void
  onRun: () => void
}

// Reactive body of the run-apps modal: heading, environment chips, the per-app
// checkbox list, and the Cancel / Run actions. Rendered as a JSX child of
// RunAppsView so gea tracks its store reads and re-renders it on every environment
// switch / checkbox toggle — the board pattern. A top-level, imperatively mounted
// component (RunAppsView) does not re-subscribe on store writes, so all reactive
// markup lives here.
class RunAppsBody extends Component {
  declare props: { deps: RunAppsDeps }

  template({ deps }: this['props']) {
    if (deps.emptyText) {
      return (
        <div class="project-picker">
          <h2>{deps.title}</h2>
          <div class="empty-hint">{deps.emptyText}</div>
        </div>
      )
    }

    // Subscribe to the reactive store fields so this child re-renders on any
    // environment switch or checkbox toggle.
    const env = store.env
    return (
      <div class="project-picker">
        <h2>{deps.title}</h2>
        <div class="reminder-label">Environment</div>
        <EnvironmentChips
          environments={deps.environments}
          selected={env}
          onSelect={(name: string) => store.setEnv(name)}
        />
        <div class="reminder-label">Applications</div>
        <div class="run-app-list">
          {store.apps.map((app, i) => (
            <ApplicationCheckboxRow
              key={app.name + ' ' + i}
              name={app.name}
              cmd={(app.commands?.[env] ?? '').trim()}
              env={env}
              checked={!!store.checked[i]}
              onToggle={(v: boolean) => store.setChecked(i, v)}
            />
          ))}
        </div>
        <div class="modal-actions">
          <button onClick={() => deps.close()}>{UITexts.Pickers.project.cancel}</button>
          <button class="button-primary" onClick={() => deps.onRun()}>
            Run
          </button>
        </div>
      </div>
    )
  }
}

// Thin shell for the run-apps modal, mounted imperatively into the shared overlay
// modal. `deps` arrive via the constructor into a plain field. The reactive markup
// lives in the RunAppsBody JSX child.
export default class RunAppsView extends Component {
  private readonly deps: RunAppsDeps

  constructor(deps: RunAppsDeps) {
    super()
    this.deps = deps
  }

  template() {
    return <RunAppsBody deps={this.deps} />
  }
}
