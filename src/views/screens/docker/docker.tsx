import '@views/screens/docker/docker.css'
import { Component } from '@geajs/core'
import { UITexts } from '@texts'
import { SUB_TABS } from './docker.store'
import DockerRow from './components/docker-row'
import store from './docker.store'

// Inline-style helper: restore the stylesheet display when shown, `none` when
// hidden. Keeps the keyed row list permanently mounted (gea fails to materialize
// a keyed list that first appears from the false branch of a conditional) — only
// its visibility flips between the list and the unavailable empty state.
const show = (on: boolean): { display: string } => ({ display: on ? '' : 'none' })

// gea Docker panel: a sub-tab bar (containers/images/volumes/networks/compose),
// a shared-search-filtered keyed row list, and a per-tab prune footer — all
// reactive off the store. Replaces the legacy renderDocker() closure +
// applyFilter()/mergeStats() DOM patching. The detail/text modals are imperative
// overlays opened from row actions (see ./components). The root is
// display:contents so the empty state / sub-tab bar / list lay out as direct
// children of the host `.docker-mode` element (layout parity with the legacy
// entry).
export default class Docker extends Component {
  created(): void {
    void store.reload()
  }

  template() {
    const unavailable = store.available === false
    const items = store.filtered
    const prune = store.pruneFooter
    return (
      <div style={{ display: 'contents' }}>
        <div class="docker-empty" style={show(unavailable)}>
          <div class="docker-empty-title">Docker is not available</div>
          <div class="docker-empty-sub">{store.availError || 'Start Docker Desktop and try again.'}</div>
          <button class="settings-inline-btn" onClick={() => store.retry()}>
            {UITexts.Docker.retry}
          </button>
        </div>
        <div class="docker-subtabs" style={show(!unavailable)}>
          {SUB_TABS.map((t) => (
            <button
              key={t.key}
              class={'docker-subtab' + (t.key === store.subTab ? ' active' : '')}
              onClick={() => store.setSubTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div class="docker-list" style={show(!unavailable)}>
          {store.loading && items.length === 0 && <div class="docker-empty-row">{UITexts.Docker.loading}</div>}
          {!store.loading && items.length === 0 && <div class="docker-empty-row">{store.emptyLabel}</div>}
          {items.map((vm) => (
            <DockerRow key={vm.id} vm={vm} />
          ))}
          {prune && (
            <div class="docker-list-foot">
              <button class="settings-inline-btn" onClick={() => void store.prune(prune.target, prune.label)}>
                {prune.label}
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }
}
