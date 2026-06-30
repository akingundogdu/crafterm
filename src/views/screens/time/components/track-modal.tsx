import { Component } from '@geajs/core'
import { UITexts } from '@texts'
import Button from '@views/components/button/button'
import store from './track-modal.store'

// gea track-modal body: project + feature selects (feature list follows the
// project) and the action row (optional Stop when already tracking + Track),
// mounted into a @views overlay by openTrackModal. Self-contained — no @ui (§2.7).
export default class TrackModal extends Component {
  template() {
    const projects = store.projects
    return (
      <div class="modal track-modal">
        <button
          class="modal-close"
          type="button"
          aria-label="Close"
          title="Close (Esc)"
          onClick={() => store.close()}
        >
          ×
        </button>
        <h2>{UITexts.Time.trackModal.title}</h2>
        <div class="reminder-label">{UITexts.Time.trackModal.project}</div>
        <select
          class="settings-select"
          style={{ width: '100%' }}
          onChange={(e: Event) => store.setProject((e.target as HTMLSelectElement).value)}
        >
          {projects.length === 0 && <option value="">(no projects)</option>}
          {projects.map((p) => (
            <option key={p.path} value={p.path} selected={p.path === store.project}>
              {p.name}
            </option>
          ))}
        </select>
        <div class="reminder-label">{UITexts.Time.trackModal.feature}</div>
        <select
          class="settings-select"
          style={{ width: '100%' }}
          onChange={(e: Event) => store.setFeature((e.target as HTMLSelectElement).value)}
        >
          <option value="" selected={store.feature === ''}>
            {UITexts.Time.noFeature}
          </option>
          {store.features.map((f) => (
            <option key={f.id} value={f.id} selected={f.id === store.feature}>
              {f.name}
            </option>
          ))}
        </select>
        <div class="modal-actions">
          {store.hasTracking && (
            <Button text={UITexts.Time.trackModal.stopTracking} onClick={() => store.stop()} />
          )}
          <Button text={UITexts.Time.trackModal.track} variant="primary" onClick={() => store.track()} />
        </div>
      </div>
    )
  }
}
