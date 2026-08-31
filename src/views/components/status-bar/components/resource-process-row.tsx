import { Component } from '@geajs/core'
import './resource-process-row.css'
import { UITexts } from '@texts'
import store from './resource-chip.store'
import { formatRowCpu, formatRowMemory, actionsFor, rowTitle } from './resource-process-row.store'
import type { ProcessGroup } from '@services/system/system.types'

// One application row in the resource popover: name, live CPU share, resident
// memory, and (for another user-owned app) quit / force-quit. A JSX child of the
// popover's keyed list, so its handlers live in this template rather than inside
// the parent's `.map()` (§5 gea gotchas).
export default class ResourceProcessRow extends Component {
  declare props: { group: ProcessGroup }

  template() {
    const group = this.props.group
    const actions = actionsFor(group)
    const busy = store.busyKey === group.key
    return (
      <div class={'resource-process-row' + (busy ? ' busy' : '')}>
        <span class="resource-process-row-name" title={rowTitle(group)}>
          {group.name}
        </span>
        <span class="resource-process-row-cpu">{formatRowCpu(group.cpuPct)}</span>
        <span class="resource-process-row-memory">{formatRowMemory(group.memoryBytes)}</span>
        <span class="resource-process-row-actions">
          {group.isOwn && <span class="resource-process-row-own">{UITexts.Resources.popover.ownApp}</span>}
          {actions.map((action) => (
            <button
              key={action.key}
              class="resource-process-row-action"
              title={action.title}
              onClick={() => void store.quit(group, action.force)}
            >
              {action.label}
            </button>
          ))}
        </span>
      </div>
    )
  }
}
