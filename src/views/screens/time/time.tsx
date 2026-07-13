import './time.css'
import { Component } from '@geajs/core'
import { fmtClock } from '@services/domain/time'
import { UITexts } from '@texts'
import { openReport } from './components/time-report.open'
import store from './time.store'

// gea Time panel (right panel → Time tab): project/feature selectors, the manual
// timer + pomodoro controls, the report bar, and the live Today summary — all
// reactive off the time store, replacing the legacy static index.html markup +
// renderTime()/initTime() imperative wiring. The root is display:contents so its
// children lay out as direct children of the #notif-time-view host (§5.8 / layout
// parity). Self-contained — no @ui (§2.7).
export default class Time extends Component {
  created(): void {
    store.ensureSelection()
  }

  template() {
    const running = store.isRunning
    return (
      <div class="time-root" style={{ display: 'contents' }}>
        <div class="time-controls">
          <select
            id="time-project"
            class="settings-select"
            disabled={running}
            onChange={(e: Event) => store.setProject((e.target as HTMLSelectElement).value)}
          >
            {store.projects.length === 0 && <option value=""></option>}
            {store.projects.map((p) => (
              <option key={p.path} value={p.path} selected={p.path === store.selectedProject}>
                {p.name}
              </option>
            ))}
          </select>
          <div class="time-feature-row">
            <select
              id="time-feature"
              class="settings-select"
              disabled={running}
              onChange={(e: Event) => store.setFeature((e.target as HTMLSelectElement).value)}
            >
              <option value="" selected={store.selectedFeature === ''}></option>
              {store.features.map((f) => (
                <option key={f.id} value={f.id} selected={f.id === store.selectedFeature}>
                  {f.name}
                </option>
              ))}
            </select>
            <button id="time-add-feature" title="New feature" onClick={() => void store.addFeature()}>
              +
            </button>
          </div>
          <div class="time-timer">
            <span id="time-elapsed">{fmtClock(store.elapsedMs)}</span>
            <button id="time-toggle" class={running ? 'running' : undefined} onClick={() => store.toggle()}>
              {running ? UITexts.Time.stop : UITexts.Time.start}
            </button>
          </div>
          <div class="time-pomodoro">
            <span class="time-pom-label">Pomodoro</span>
            {[25, 30, 40].map((min) => (
              <button
                key={min}
                class="time-pom-preset"
                data-min={String(min)}
                disabled={running}
                onClick={() => store.startPomodoro(min * 60_000, store.pomRepeat)}
              >
                {`${min}m`}
              </button>
            ))}
          </div>
          <div class="time-pom-custom">
            <input
              id="time-pom-min"
              type="number"
              min="1"
              max="600"
              placeholder="min"
              value={store.pomMin}
              onInput={(e: Event) => (store.pomMin = (e.target as HTMLInputElement).value)}
              onKeyDown={(e: KeyboardEvent) => {
                e.stopPropagation()
                if (e.key === 'Enter') store.startCustomPomodoro()
              }}
            />
            <label class="time-pom-repeat">
              <input
                id="time-pom-repeat"
                type="checkbox"
                checked={store.pomRepeat}
                onChange={(e: Event) => (store.pomRepeat = (e.target as HTMLInputElement).checked)}
              />{' '}
              repeat
            </label>
            <button id="time-pom-start" onClick={() => store.startCustomPomodoro()}>
              Start timer
            </button>
          </div>
        </div>
        <div class="time-report-bar">
          <button id="time-report-btn" onClick={() => openReport()}>
            View report
          </button>
        </div>
        <div id="time-summary">
          <div class="time-summary-head"></div>
          {store.summary.map((row) => (
            <div key={row.path} class="time-summary-row">
              <span class="time-summary-name">{row.name}</span>
              <span class="time-summary-dur">{row.dur}</span>
            </div>
          ))}
          {store.summary.length === 0 && <div class="notif-empty"></div>}
        </div>
      </div>
    )
  }
}
