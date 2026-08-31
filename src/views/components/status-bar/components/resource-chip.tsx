import { Component } from '@geajs/core'
import './resource-chip.css'
import { UITexts } from '@texts'
import store, { formatPct, levelOf } from './resource-chip.store'
import ResourcePopover from './resource-popover'

// Machine CPU + RAM readout, sitting beside the sidebar toggle at the left end of
// the status bar. Clicking it opens the resource popover (top applications by CPU
// or memory).
//
// The reactive markup lives in the CHILD component: the chip is mounted
// imperatively by the status-bar entry, and an imperatively-mounted gea component
// does not re-subscribe to store writes — only a JSX child does (§5).
class ResourceChipBody extends Component {
  private chipEl: HTMLElement | null = null

  // Polling starts once the chip is in the DOM; `start()` is idempotent, so the
  // re-render on every poll does not stack timers.
  onAfterRender(): void {
    store.start()
  }

  private onClick = (): void => {
    const rect = this.chipEl?.getBoundingClientRect()
    store.toggle({ top: rect ? rect.bottom + 6 : 34, left: rect ? rect.left : 10 })
  }

  template() {
    const metrics = store.metrics
    const T = UITexts.Resources.chip
    const cpuPct = metrics?.cpu.usagePct ?? 0
    const memPct = metrics?.memory.usedPct ?? 0
    const cpu = metrics ? formatPct(cpuPct) : T.loading
    const ram = metrics ? formatPct(memPct) : T.loading
    return (
      <div class="resource-chip-wrap">
        <button
          class={'resource-chip' + (store.isOpen ? ' active' : '')}
          title={T.title}
          aria-label={T.title}
          ref={this.chipEl}
          onClick={this.onClick}
        >
          <span class="resource-chip-label">{T.cpu}</span>
          <span class={'resource-chip-value ' + levelOf(cpuPct)}>{cpu}</span>
          <span class="resource-chip-sep">·</span>
          <span class="resource-chip-label">{T.ram}</span>
          <span class={'resource-chip-value ' + levelOf(memPct)}>{ram}</span>
        </button>
        <ResourcePopover />
      </div>
    )
  }
}

export default class ResourceChip extends Component {
  template() {
    return (
      <div class="resource-chip-root">
        <ResourceChipBody />
      </div>
    )
  }
}

// Mount the chip into its status-bar host element.
export function mountResourceChip(host: HTMLElement): void {
  new ResourceChip().render(host)
}
