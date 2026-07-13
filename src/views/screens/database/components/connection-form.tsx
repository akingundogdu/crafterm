import { Component } from '@geajs/core'
import { UITexts } from '@texts'
import type { DbEngine } from '@views/types/types'
import { engineClass } from '../database.store'
import store from './connection-form.store'

// gea connection add/edit form body, mounted into the @views overlay backdrop by
// openConnectionForm. Renders the `.modal.db-conn-modal` shell: the engine
// segmented control, the network fields (postgres/mysql) and the sqlite file
// field toggled by the engine, a test-status line, and the Test/Save actions. The
// close button is rendered inline (byte-identical to makeCloseButton) so it stays
// a direct child of `.modal` and survives the store's reactive re-renders. State +
// persistence live in the store. Self-contained — no @ui (§2.7).
const ENGINES: { value: DbEngine; label: string }[] = [
  { value: 'postgres', label: UITexts.Database.engines.postgres },
  { value: 'mysql', label: UITexts.Database.engines.mysql },
  { value: 'sqlite', label: 'SQLite' }
]

export default class ConnectionForm extends Component {
  template() {
    return (
      <div class="modal db-conn-modal">
        <button
          class="modal-close"
          type="button"
          aria-label="Close"
          title="Close (Esc)"
          onClick={() => store.close()}
        >
          ×
        </button>
        <h2>{store.titleText}</h2>
        <div class="reminder-label">Engine</div>
        <div class="database-engine-selector">
          {ENGINES.map((entry) => {
            const v = entry.value
            return (
              <button
                type="button"
                data-engine={v}
                class={'database-engine-button ' + engineClass(v) + (v === store.engine ? ' active' : '')}
                onClick={() => store.setEngine(v)}
              >
                {entry.label}
              </button>
            )
          })}
        </div>
        <div class="reminder-label">Name</div>
        <input
          class="reminder-input"
          type="text"
          placeholder={UITexts.Database.ph.name}
          value={store.name}
          onInput={(e: Event) => (store.name = (e.target as HTMLInputElement).value)}
        />
        <div style={{ display: store.isSqlite ? 'none' : '' }}>
          <div class="reminder-label">{UITexts.Database.fields.host}</div>
          <input
            class="reminder-input"
            type="text"
            placeholder={UITexts.Database.ph.host}
            value={store.host}
            onInput={(e: Event) => (store.host = (e.target as HTMLInputElement).value)}
          />
          <div class="reminder-label">{UITexts.Database.fields.port}</div>
          <input
            class="reminder-input"
            type="number"
            placeholder={store.portPlaceholder}
            value={store.port}
            onInput={(e: Event) => (store.port = (e.target as HTMLInputElement).value)}
          />
          <div class="reminder-label">{UITexts.Database.fields.user}</div>
          <input
            class="reminder-input"
            type="text"
            placeholder={UITexts.Database.ph.user}
            value={store.user}
            onInput={(e: Event) => (store.user = (e.target as HTMLInputElement).value)}
          />
          <div class="reminder-label">{UITexts.Database.fields.password}</div>
          <input
            class="reminder-input"
            type="password"
            placeholder={UITexts.Database.ph.password}
            value={store.pass}
            onInput={(e: Event) => (store.pass = (e.target as HTMLInputElement).value)}
          />
          <div class="reminder-label">{UITexts.Database.fields.database}</div>
          <input
            class="reminder-input"
            type="text"
            placeholder={UITexts.Database.ph.database}
            value={store.database}
            onInput={(e: Event) => (store.database = (e.target as HTMLInputElement).value)}
          />
          <label class="checkbox-row">
            <input
              type="checkbox"
              checked={store.ssl}
              onChange={(e: Event) => (store.ssl = (e.target as HTMLInputElement).checked)}
            />
            Use SSL
          </label>
        </div>
        <div style={{ display: store.isSqlite ? '' : 'none' }}>
          <div class="reminder-label">SQLite file</div>
          <input
            class="reminder-input"
            placeholder={UITexts.Database.ph.file}
            value={store.file}
            onInput={(e: Event) => (store.file = (e.target as HTMLInputElement).value)}
          />
        </div>
        <div class={store.statusClass}>{store.statusText}</div>
        <div class="modal-actions">
          <button onClick={() => store.testConnection()}>Test</button>
          <button class="button-primary" onClick={() => store.save()}>
            {store.saveLabel}
          </button>
        </div>
      </div>
    )
  }
}
