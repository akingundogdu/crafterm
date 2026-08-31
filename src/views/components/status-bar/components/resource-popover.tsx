import { Component } from '@geajs/core'
import './resource-popover.css'
import { UITexts } from '@texts'
import store from './resource-chip.store'
import { metersFor, breakdownFor, SORT_OPTIONS } from './resource-popover.store'
import ResourceProcessRow from './resource-process-row'

// Detail popover for the status-bar resource chip: CPU / memory / swap bars, the
// Activity-Monitor memory split, and the heaviest applications (sortable by CPU or
// memory, each quittable). A JSX child of the chip body, so it re-renders with the
// store; it stays mounted and toggles `display` instead of unmounting — a keyed
// list that first appears from the false branch of a conditional does not
// materialize in gea (§5).
export default class ResourcePopover extends Component {
  template() {
    const metrics = store.metrics
    const meters = metersFor(metrics)
    const breakdown = breakdownFor(metrics)
    const rows = store.rows
    const T = UITexts.Resources.popover
    return (
      <div
        class="resource-popover"
        style={{
          display: store.isOpen ? '' : 'none',
          top: store.anchorTop + 'px',
          left: store.anchorLeft + 'px'
        }}
      >
        <div class="resource-popover-head">
          <div class="resource-popover-title">{T.title}</div>
        </div>
        {meters.map((meter) => (
          <div key={meter.key} class="resource-popover-meter">
            <div class="resource-popover-meter-head">
              <b>{meter.label}</b>
              <span class="resource-popover-meter-detail">{meter.detail}</span>
            </div>
            <div class="resource-popover-bar">
              <div
                class={'resource-popover-bar-fill ' + meter.level}
                style={{ width: Math.min(100, Math.round(meter.pct)) + '%' }}
              />
            </div>
          </div>
        ))}
        <div class="resource-popover-breakdown">
          {breakdown.map((item) => (
            <div key={item.label} class="resource-popover-breakdown-row">
              <span>{item.label}</span>
              <span>{item.value}</span>
            </div>
          ))}
        </div>
        <div class="resource-popover-sorts">
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.key}
              class={'resource-popover-sort' + (store.sortBy === option.key ? ' active' : '')}
              onClick={() => store.setSort(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div class="resource-popover-rows">
          {rows.length === 0 && <div class="resource-popover-empty">{T.empty}</div>}
          {rows.map((group) => (
            <ResourceProcessRow key={group.key} group={group} />
          ))}
        </div>
        {store.error && <div class="resource-popover-error">{store.error}</div>}
      </div>
    )
  }
}
