import { Component } from '@geajs/core'
import './time-report.css'
import type { Range } from '@services/domain/time'
import { UITexts } from '@texts'
import { rangeTab } from './time-report.store'
import store from './time-report.store'

const RANGES: Range[] = ['today', 'week', 'month', 'all']

// gea report-modal body (total per project → feature over a date range), mounted
// into a @views overlay by openReport. Chips switch the range; Copy hands the user
// a paste-ready summary. Self-contained — no @ui (§2.7).
export default class TimeReport extends Component {
  template() {
    const { rows } = store.computed
    return (
      <div class="modal time-report-modal">
        <button
          class="modal-close"
          type="button"
          aria-label="Close"
          title="Close (Esc)"
          onClick={() => store.close()}
        >
          ×
        </button>
        <h2>{UITexts.Time.report.title}</h2>
        <div class="time-report-chips">
          {RANGES.map((r) => (
            <button
              key={r}
              class={'time-report-chip' + (r === store.range ? ' active' : '')}
              onClick={() => store.setRange(r)}
            >
              {rangeTab(r)}
            </button>
          ))}
        </div>
        <div class="time-report-body">
          {rows.map((row) => (
            <div key={row.id} class={'time-report-row ' + row.cls}>
              <span class="time-report-name">{row.name}</span>
              <span class="time-report-dur">{row.dur}</span>
            </div>
          ))}
          {rows.length === 0 && <div class="notif-empty"></div>}
        </div>
        <div class="time-report-foot">
          <button class="settings-inline-btn" onClick={() => store.copy()}>
            {store.copied ? UITexts.Time.report.copied : UITexts.Time.report.copy}
          </button>
        </div>
      </div>
    )
  }
}
