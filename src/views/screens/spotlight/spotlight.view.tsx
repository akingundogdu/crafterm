import './spotlight.css'
import { Component } from '@geajs/core'
import { UITexts } from '@texts'
import { effectiveCombo, comboLabel } from '@views/keybindings/keybindings'
import type { SpotEntry } from './components/result-list'
import { TABS, TAB_ACTION } from './components/spot-tabs'
import { BADGE_LABEL } from './spotlight.store'
import { spotlightStore as store, filterSpotEntries } from './spotlight.store'
import ProjectSelect from '@views/components/project-select/project-select'
import SpotTab from './components/tab-button'
import ResultRow from './components/result-row'

// The behaviour the reactive body needs, supplied by the controller: keyboard nav
// on the search input, choosing an entry, hover-to-highlight, and switching tabs.
// The handlers close over the controller's overlay/close, the async lazy loads, and
// the selection state it pushes into the store.
export interface SpotlightDeps {
  onKeyDown: (e: KeyboardEvent) => void
  onChoose: (e: SpotEntry) => void
  onHover: (index: number) => void
  onSelectTab: (tab: string) => void
  // Files tab: rescan within another project ('' = every folder from Settings).
  onSelectFileProject: (projectId: string | null) => void
}

// Reactive body of the spotlight: the search input, the WebStorm-style tab strip,
// and the live-filtered result list (capped at 200). Rendered as a JSX child of the
// SpotlightView shell so gea tracks its store reads and re-renders on every
// keystroke / tab switch / arrow-key move — the command-palette pattern. A top-level,
// imperatively mounted component (SpotlightView) does not re-subscribe on store
// writes, so all reactive markup lives here.
class SpotlightBody extends Component {
  declare props: { deps: SpotlightDeps }

  template({ deps }: this['props']) {
    // Read the reactive store fields (active tab + loaded entries + query + selection
    // + loading) so this child re-renders on any keystroke AND after a tab load.
    const activeTab = store.activeTab
    const showBadge = activeTab === 'all'
    const items = store.loading ? [] : filterSpotEntries(store.current, store.query)
    const sel = items.length ? Math.min(store.sel, items.length - 1) : 0

    return (
      <div>
        <input
          class="search-box-input"
          type="text"
          spellcheck="false"
          placeholder={UITexts.Spotlight.searchPlaceholder}
          value={store.query}
          onInput={(e: Event) => store.setQuery((e.target as HTMLInputElement).value)}
          onKeyDown={deps.onKeyDown}
        />
        <div class="spot-tabs">
          {TABS.map((t) => {
            const combo = effectiveCombo(TAB_ACTION[t.id])
            return (
              <SpotTab
                key={t.id}
                tab={t}
                active={t.id === activeTab}
                combo={combo ? comboLabel(combo) : null}
                onSelect={deps.onSelectTab}
              />
            )
          })}
        </div>
        {activeTab === 'files' && (
          <div class="spotlight-file-scope">
            <span class="spotlight-file-scope-label">{UITexts.Spotlight.searchIn}</span>
            <ProjectSelect
              value={store.fileProjectId ?? ''}
              emptyLabel={UITexts.Spotlight.allFolders}
              selectClass="settings-select"
              onChange={(id: string) => deps.onSelectFileProject(id || null)}
            />
          </div>
        )}
        <div class="pick-list picker-list spot-list">
          {items.map((e, i) => (
            <ResultRow
              key={`${e.source}:${e.label}:${i}`}
              entry={e}
              index={i}
              active={i === sel}
              showBadge={showBadge}
              badgeLabel={BADGE_LABEL[e.source]}
              onChoose={deps.onChoose}
              onHover={deps.onHover}
            />
          ))}
          {items.length === 0 && (
            <div class="empty-hint">
              {store.loading ? UITexts.Spotlight.loading : UITexts.Spotlight.noMatches}
            </div>
          )}
        </div>
      </div>
    )
  }
}

// Thin shell for the spotlight, mounted imperatively into the shared overlay modal.
// `deps` arrive via the constructor into a plain field — a gea Component only
// populates `this.props` when rendered from a parent template, not from a manual
// `new X()`. The reactive markup lives in the SpotlightBody JSX child.
export default class SpotlightView extends Component {
  private readonly deps: SpotlightDeps

  constructor(deps: SpotlightDeps) {
    super()
    this.deps = deps
  }

  template() {
    return <SpotlightBody deps={this.deps} />
  }
}
