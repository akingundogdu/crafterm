import { Component } from '@geajs/core'
import { UITexts } from '@texts'
import { filterBranches } from '../git.state'
import store from '../branch.store'
import GitQuickActionChips from './git-quick-action-chips'
import BranchRow from './branch-row'

// The chrome + behaviour the branch picker needs, supplied by the controller that
// mounts it. The quick-action handlers fire a git command and close; onSelect
// checks out a branch; onHover/onKeyDown drive the store's selection index.
export interface BranchPickerDeps {
  onFetch: (e: MouseEvent) => void
  onPull: (e: MouseEvent) => void
  onStatus: (e: MouseEvent) => void
  onSelect: (branch: string) => void
  onHover: (index: number) => void
  onKeyDown: (e: KeyboardEvent) => void
}

// Reactive body of the branch picker: heading, the quick-action chips, the search
// box and the live-filtered branch list with a keyboard/hover highlight. Rendered as
// a JSX child of BranchCheckoutView so gea tracks its store reads and re-renders it
// on every keystroke, arrow-key nav and hover — the board pattern. A top-level,
// imperatively mounted component (BranchCheckoutView) does not re-subscribe on store
// writes, so all reactive markup lives here.
class BranchList extends Component {
  declare props: { deps: BranchPickerDeps }

  template({ deps }: this['props']) {
    // Read the reactive store fields (the loaded list, the search and the highlight
    // index) so this child re-renders on any keystroke, arrow-key move or hover.
    const all = store.branches
    const items = filterBranches(all, store.search)
    const sel = store.sel

    return (
      <div class="git-picker">
        <h2>{UITexts.Pickers.git.branchHeading}</h2>
        <GitQuickActionChips onFetch={deps.onFetch} onPull={deps.onPull} onStatus={deps.onStatus} />
        <div class="git-quick-sub">Checkout</div>
        <input
          class="search-box-input"
          type="text"
          spellcheck="false"
          placeholder={UITexts.Pickers.git.branchPlaceholder}
          value={store.search}
          onInput={(e: Event) => store.setSearch((e.target as HTMLInputElement).value)}
          onKeyDown={deps.onKeyDown}
        />
        <div class="pick-list picker-list">
          {items.map((b, i) => (
            <BranchRow
              key={b}
              branch={b}
              isActive={i === sel}
              onSelect={() => deps.onSelect(b)}
              onHover={() => deps.onHover(i)}
            />
          ))}
          {items.length === 0 && (
            <div class="empty-hint">{all.length ? 'No matches' : 'No branches (not a git repo?)'}</div>
          )}
        </div>
      </div>
    )
  }
}

// Thin shell for the branch picker, mounted imperatively into the shared overlay
// modal. `deps` arrive via the constructor into a plain field — a gea Component only
// populates `this.props` when rendered from a parent template, not from a manual
// `new X()`. The reactive markup lives in the BranchList JSX child.
export default class BranchCheckoutView extends Component {
  private readonly deps: BranchPickerDeps

  constructor(deps: BranchPickerDeps) {
    super()
    this.deps = deps
  }

  template() {
    return <BranchList deps={this.deps} />
  }
}
