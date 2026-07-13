import { Component } from '@geajs/core'
import './notif-filters.css'
import { KIND_CHIPS, ALL_PROJECTS_LABEL } from './notif-filters.store'
import store from '../notifications.store'

// Filter chips above the Alerts list (todomr9i30ytij): one row for the status
// (question / done / reminder) and one for the project a notification came from.
// The project row only appears once there is more than one project to choose from.
export default class NotifFilters extends Component {
  template() {
    const projects = store.projectChips
    const kind = store.kindFilter
    const project = store.projectFilter
    return (
      <div class="notif-filters">
        <div class="notif-filter-row">
          {KIND_CHIPS.map((c) => (
            <button
              key={c.id}
              class={'notif-filter-chip' + (c.id === kind ? ' active' : '')}
              onClick={() => store.setKindFilter(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
        {projects.length > 1 && (
          <div class="notif-filter-row">
            <button
              class={'notif-filter-chip' + (project === '' ? ' active' : '')}
              onClick={() => store.setProjectFilter('')}
            >
              {ALL_PROJECTS_LABEL}
            </button>
            {projects.map((p) => (
              <button
                key={p.project}
                class={'notif-filter-chip' + (p.project === project ? ' active' : '')}
                title={p.project}
                onClick={() => store.setProjectFilter(p.project)}
              >
                <span class="notif-filter-chip-name">{p.project}</span>
                <span class="notif-filter-chip-count">{String(p.count)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }
}
