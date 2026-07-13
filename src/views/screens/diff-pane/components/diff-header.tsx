import { Component } from '@geajs/core'
import { SEARCH_SVG, stopAnd } from '../diff-pane.store'
import { createFileCounter } from './file-counter'

interface DiffHeaderOptions {
  onPrev: () => void
  onNext: () => void
  onToggleSearch: () => void
  onReload: () => void
  onClose: () => void
}

interface DiffHeaderHandle {
  el: HTMLDivElement
  // Reflects the active file: path text/title, counter, and prev/next disabled.
  update: (path: string, oneBasedIndex: number, total: number) => void
}

// The diff pane header markup: prev · search | path · counter | reload · next ·
// close. A gea Component owns the buttons (their click handlers live on direct
// children of the single root, so gea honours them); the exported factory reads
// the element refs, injects the search icon, mounts the file counter, and drives
// `update`. Data arrives via the constructor into a plain field (a manual
// `new X()` does not populate `this.props`). Self-contained (§2.7).
class DiffHeaderView extends Component {
  prevEl: HTMLButtonElement | null = null
  searchBtnEl: HTMLButtonElement | null = null
  htitleEl: HTMLSpanElement | null = null
  centerEl: HTMLDivElement | null = null
  nextEl: HTMLButtonElement | null = null
  private readonly o: DiffHeaderOptions

  constructor(opts: { o: DiffHeaderOptions }) {
    super()
    this.o = opts.o
  }

  onAfterRender(): void {
    if (this.searchBtnEl) this.searchBtnEl.innerHTML = SEARCH_SVG
  }

  template() {
    const o = this.o
    return (
      <div class="pane-header diff-header">
        <button class="diff-nav" title="Previous file" onClick={stopAnd(o.onPrev)} ref={this.prevEl}>
          ‹
        </button>
        <button
          class="diff-hbtn"
          title="Find a file in this diff"
          onClick={stopAnd(o.onToggleSearch)}
          ref={this.searchBtnEl}
        />
        <div class="diff-hcenter" ref={this.centerEl}>
          <span class="diff-path" ref={this.htitleEl} />
        </div>
        <button class="diff-hbtn" title="Reload diff" onClick={stopAnd(o.onReload)}>
          ⟳
        </button>
        <button class="diff-nav" title="Next file" onClick={stopAnd(o.onNext)} ref={this.nextEl}>
          ›
        </button>
        <button class="diff-hbtn diff-hclose" title="Close" onClick={stopAnd(o.onClose)}>
          ×
        </button>
      </div>
    )
  }
}

// The diff pane header: prev · search | path · counter | reload · next · close.
// Owns its buttons and the file counter; navigation drives it via `update`.
export function createDiffHeader(opts: DiffHeaderOptions): DiffHeaderHandle {
  const counter = createFileCounter()
  const view = new DiffHeaderView({ o: opts })
  const host = document.createElement('div')
  view.render(host)
  const headerEl = host.firstElementChild as HTMLDivElement
  const htitle = view.htitleEl as HTMLSpanElement
  const prev = view.prevEl as HTMLButtonElement
  const next = view.nextEl as HTMLButtonElement
  ;(view.centerEl as HTMLDivElement).appendChild(counter.el)

  return {
    el: headerEl,
    update: (path: string, oneBasedIndex: number, total: number) => {
      htitle.textContent = total ? path : ''
      htitle.title = htitle.textContent
      counter.set(oneBasedIndex, total)
      prev.disabled = oneBasedIndex <= 1
      next.disabled = oneBasedIndex >= total
    }
  }
}
