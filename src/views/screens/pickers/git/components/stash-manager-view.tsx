import { Component } from '@geajs/core'
import { UITexts } from '@texts'
import { filterStashes, makeStashApplyClick, makeStashDropClick } from '../git.state'
import store from '../stash.store'
import StashRow from './stash-row'

// The chrome the stash list needs, supplied by the controller that mounts it. The
// handlers close over the controller's paneId / close / reload so the list can build
// per-stash apply + drop handlers itself (the ssh list pattern).
export interface StashManagerDeps {
  paneId: string
  close: () => void
  reload: () => void
}

// Reactive body of the stash manager: heading, the search box and the live-filtered
// stash list. Rendered as a JSX child of StashManagerView so gea tracks its store
// reads and re-renders it on every search keystroke AND after a drop-stash reload —
// the board pattern. A top-level, imperatively mounted component (StashManagerView)
// does not re-subscribe on store writes, so all reactive markup lives here.
class StashList extends Component {
  declare props: { deps: StashManagerDeps }

  template({ deps }: this['props']) {
    // Read the reactive store fields (the loaded list + the search) so this child
    // re-renders on any keystroke AND after a drop reload swaps in a fresh list.
    const all = store.stashes
    const stashes = filterStashes(all, store.search)

    return (
      <div class="git-picker">
        <h2>{UITexts.Pickers.git.stashesHeading}</h2>
        <input
          class="search-box-input"
          type="text"
          spellcheck="false"
          placeholder="Search stashes…"
          value={store.search}
          onInput={(e: Event) => store.setSearch((e.target as HTMLInputElement).value)}
        />
        <div class="pick-list picker-list">
          {stashes.map((s) => (
            <StashRow
              key={s.ref}
              stash={s}
              onApply={makeStashApplyClick(deps.paneId, s.ref, deps.close)}
              onDrop={makeStashDropClick(deps.paneId, s.ref, deps.reload)}
            />
          ))}
          {stashes.length === 0 && (
            <div class="empty-hint">
              {all.length ? UITexts.Pickers.common.noMatches : UITexts.Pickers.git.noStashes}
            </div>
          )}
        </div>
      </div>
    )
  }
}

// Thin shell for the stash manager, mounted imperatively into the shared overlay
// modal. `deps` arrive via the constructor into a plain field — a gea Component only
// populates `this.props` when rendered from a parent template, not from a manual
// `new X()`. The reactive markup lives in the StashList JSX child.
export default class StashManagerView extends Component {
  private readonly deps: StashManagerDeps

  constructor(deps: StashManagerDeps) {
    super()
    this.deps = deps
  }

  template() {
    return <StashList deps={this.deps} />
  }
}
