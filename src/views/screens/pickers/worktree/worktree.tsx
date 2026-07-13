import { Component } from '@geajs/core'
import './worktree.css'
import { state, panes } from '@views/state/spine'
import { UITexts } from '@texts'
import { gitService } from '@services'
import type { WorktreeListing } from '@services/git/git.types'
import { overlayModal } from '../shared'
import {
  worktreeMatches,
  makeAddWorktree,
  makeOpenClaude,
  makeRemoveWorktree,
  makeOpenDir
} from './worktree.store'
import store from './worktree.store'
import WorktreeRow from './components/worktree-row'

// ---- Worktree dashboard: list the active repo's worktrees, act on them ----

// Reactive body of the worktree dashboard: heading, repo path, "+ New worktree",
// the search box and the live-filtered worktree list. Rendered as a JSX child of
// WorktreeShell so gea tracks its store reads and re-renders it on every search
// keystroke / bump — the board pattern. A top-level, imperatively mounted component
// (WorktreeShell) does not re-subscribe on store writes, so all reactive markup
// lives here. The worktree listing is captured once (async fetch) and handed in as
// a prop. Self-contained — no @ui.
class WorktreeList extends Component {
  declare props: { listing: WorktreeListing; close: () => void }

  template({ listing, close }: this['props']) {
    // Subscribe to the reactive store fields so this child re-renders on any search
    // keystroke (store.search) or post-mutation refresh (store.rev).
    void store.rev
    const search = store.search
    // NOTE: not `root` — the gea plugin generates a `root` binding for the template's
    // root element, and a local of that name collides ("Identifier 'root' has already
    // been declared") and silently drops the file out of the gea transform.
    const repoRoot = listing.root
    const items = repoRoot ? listing.worktrees.filter((w) => worktreeMatches(w, search)) : []

    return (
      <div class="worktree-picker">
        <h2>{UITexts.Pickers.worktree.heading}</h2>
        {!repoRoot ? (
          <div class="empty-hint">Open a terminal inside a git repo first.</div>
        ) : null}
        {repoRoot ? <div class="picker-path">{repoRoot}</div> : null}
        {repoRoot ? (
          <button class="settings-inline-btn" onClick={makeAddWorktree(close)}>
            + New worktree
          </button>
        ) : null}
        {repoRoot ? (
          <input
            class="search-box-input"
            type="text"
            spellcheck="false"
            placeholder="Search worktrees…"
            value={search}
            onInput={(e: Event) => store.setSearch((e.target as HTMLInputElement).value)}
          />
        ) : null}
        {repoRoot ? (
          <div class="pick-list picker-list">
            {items.map((w) => (
              <WorktreeRow
                key={w.path}
                worktree={w}
                onOpenClaude={makeOpenClaude(w.path, close)}
                onRemove={makeRemoveWorktree(repoRoot, w.path, close)}
                onRowClick={makeOpenDir(w.path, close)}
              />
            ))}
            {items.length === 0 && <div class="empty-hint">No matches</div>}
          </div>
        ) : null}
      </div>
    )
  }
}

// Thin shell for the worktree dashboard, mounted imperatively into the shared
// overlay modal. Data (the fetched listing + the modal's close fn) arrives via the
// constructor into plain fields — a gea Component only populates `this.props` when
// rendered from a parent template, not from a manual `new X()`. The reactive markup
// lives in the WorktreeList JSX child.
export default class WorktreeShell extends Component {
  private readonly listing: WorktreeListing
  private readonly closeFn: () => void

  constructor(opts: { listing: WorktreeListing; close: () => void }) {
    super()
    this.listing = opts.listing
    this.closeFn = opts.close
  }

  template() {
    return <WorktreeList listing={this.listing} close={this.closeFn} />
  }
}

export async function showWorktreeDashboard(): Promise<void> {
  const cwd = state.activePaneId ? panes.get(state.activePaneId)?.cwd ?? undefined : undefined
  const listing = await gitService.listWorktrees(cwd)
  const { modal, close } = overlayModal('picker-modal')
  store.reset()
  new WorktreeShell({ listing, close }).render(modal)
  ;(modal.querySelector('.search-box-input') as HTMLInputElement | null)?.focus()
}
