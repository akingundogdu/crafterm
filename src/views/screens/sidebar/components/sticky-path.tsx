import { Component } from '@geajs/core'
import './sticky-path.css'
import { state } from '@views/state/spine'
import { crumbSignature, crumbsFor, pickTopRowIndex } from './sticky-path.store'

// The sticky ancestor path bar: a passive label pinned to the top of the sidebar list
// that names the containers the topmost visible row lives in ("Musicpal › backend ›
// worktrees"), so a deep scroll never loses the branch it came from. Data arrives via
// the constructor into plain fields — the bar is re-mounted whenever the path changes
// (see `mountStickyPath`) rather than subscribing to a store, because a gea Component
// only populates `this.props` when rendered from a parent template. Each crumb is a
// single text span: a conditional child inside a keyed `.map()` breaks gea's render.
class StickyPathBar extends Component {
  private readonly crumbs: string[]

  constructor(crumbs: string[]) {
    super()
    this.crumbs = crumbs
  }

  template() {
    const { crumbs } = this
    return (
      <div class={'sticky-path' + (crumbs.length ? '' : ' sticky-path-empty')}>
        {crumbs.map((text, i) => (
          <span key={String(i) + ':' + text} class="sticky-path-crumb">
            {text}
          </span>
        ))}
      </div>
    )
  }
}

export interface StickyPathOptions {
  host: HTMLElement // the overlay host pinned over the list's top edge
  listEl: HTMLElement // the scrolling row list (#tab-list)
  isEnabled: () => boolean // false for the non-terminal sidebar modes (they own the list)
}

// Wire the bar to the list: it repaints on scroll, on any row add/remove and on
// resize, each coalesced into one animation frame. The re-mount is skipped when the
// path did not change, so a scroll gesture costs one binary search per frame.
export function mountStickyPath({ host, listEl, isEnabled }: StickyPathOptions): void {
  let lastSig: string | null = null
  let queued = false

  const currentCrumbs = (): string[] => {
    if (!isEnabled()) return []
    const rows = listEl.querySelectorAll<HTMLElement>('[data-tree-id]')
    if (!rows.length) return []
    // measure from below the bar, so the row it hides is the one it names
    const edge = listEl.getBoundingClientRect().top + host.offsetHeight
    const i = pickTopRowIndex(rows.length, (n) => rows[n].getBoundingClientRect().bottom, edge)
    return i < 0 ? [] : crumbsFor(state.tree, rows[i].dataset.treeId ?? null)
  }

  const paint = (): void => {
    queued = false
    const crumbs = currentCrumbs()
    const sig = crumbSignature(crumbs)
    if (sig === lastSig) return
    lastSig = sig
    host.replaceChildren()
    new StickyPathBar(crumbs).render(host)
  }

  const schedule = (): void => {
    if (queued) return
    queued = true
    requestAnimationFrame(paint)
  }

  listEl.addEventListener('scroll', schedule, { passive: true })
  window.addEventListener('resize', schedule)
  // the tree re-mounts its rows on every rebuild (collapse, rename, status change,
  // mode switch) — observing the list keeps the path honest without the callers
  // having to remember to refresh it
  new MutationObserver(schedule).observe(listEl, { childList: true, subtree: true })
  schedule()
}
