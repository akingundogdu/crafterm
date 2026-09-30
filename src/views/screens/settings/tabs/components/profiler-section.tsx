import { Component } from '@geajs/core'
import './profiler-section.css'
import { UITexts } from '@texts'
import store from './profiler-section.store'

// Start/stop control for the performance log. The reactive markup lives in the
// CHILD: this section is mounted imperatively into the settings panel, and an
// imperatively-mounted gea component does not re-subscribe to store writes —
// only a JSX child does (§gea 5).
class ProfilerSectionBody extends Component {
  private onClick = (): void => {
    void store.toggle()
  }

  template() {
    const T = UITexts.Settings.profiler
    const running = store.running
    return (
      <div class="profiler-section">
        <button
          class={running ? 'button-primary' : ''}
          disabled={store.busy}
          onClick={this.onClick}
        >
          {running ? T.stop : T.start}
        </button>
        <div class="field-hint">{running ? T.runningHint : T.idleHint}</div>
        {running && store.path && <div class="profiler-section-path">{store.path}</div>}
      </div>
    )
  }
}

export default class ProfilerSection extends Component {
  template() {
    return (
      <div class="profiler-section-root">
        <ProfilerSectionBody />
      </div>
    )
  }
}

export function buildProfilerSection(panel: HTMLElement): void {
  const host = document.createElement('div')
  new ProfilerSection().render(host)
  panel.appendChild(host.firstElementChild as HTMLElement)
}
