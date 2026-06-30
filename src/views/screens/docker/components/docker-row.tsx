import { Component } from '@geajs/core'
import type { RowVM } from '../docker.types'
import store from '../docker.store'

// gea port of a single Docker list row (main column + inline action buttons).
// The CPU/MEM stats line is read from the reactive store by statsKey, so a
// background stats load patches just this row (replaces the legacy mergeStats
// DOM-poke). Action buttons stop propagation, then run the injected handler.
export default class DockerRow extends Component {
  declare props: { vm: RowVM }

  template({ vm }: this['props']) {
    const stats = vm.statsKey ? store.statsText(vm.statsKey) : ''
    return (
      <div class="docker-row" dataset={{ search: vm.search }}>
        <div class="docker-row-main">
          <div class="docker-row-title">
            {vm.badge && <span class={'docker-badge ' + vm.badge.cls}>{vm.badge.text}</span>}
            <span class="docker-row-name" title={vm.title}>
              {vm.title}
            </span>
          </div>
          <div class="docker-row-sub" title={vm.sub}>
            {vm.sub}
          </div>
          {vm.meta && <div class="docker-row-meta">{vm.meta}</div>}
          {stats && <div class="docker-row-stats">{stats}</div>}
        </div>
        <div class="docker-row-actions">
          {vm.actions.map((a, i) => (
            <button
              key={i}
              class={'docker-act' + (a.cls ? ' ' + a.cls : '')}
              title={a.label}
              onClick={(e: MouseEvent) => {
                e.stopPropagation()
                a.run()
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    )
  }
}
