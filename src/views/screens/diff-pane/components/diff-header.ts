import { el } from '@views/lib/dom'
import { SEARCH_SVG, stopAnd } from '../diff-pane.state'
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

// The diff pane header: prev · search | path · counter | reload · next · close.
// Owns its buttons and the file counter; navigation drives it via `update`.
// Plain-DOM (el()) port of the legacy JSX factory (§2.7 self-contained, no @ui).
export function createDiffHeader(opts: DiffHeaderOptions): DiffHeaderHandle {
  const prev = el('button', { class: 'diff-nav', title: 'Previous file', onClick: stopAnd(opts.onPrev) }, '‹')
  const searchBtn = el('button', { class: 'diff-hbtn', title: 'Find a file in this diff', onClick: stopAnd(opts.onToggleSearch) })
  searchBtn.innerHTML = SEARCH_SVG
  const htitle = el('span', { class: 'diff-path' })
  const counter = createFileCounter()
  const center = el('div', { class: 'diff-hcenter' }, htitle, counter.el)
  const reload = el('button', { class: 'diff-hbtn', title: 'Reload diff', onClick: stopAnd(opts.onReload) }, '⟳')
  const next = el('button', { class: 'diff-nav', title: 'Next file', onClick: stopAnd(opts.onNext) }, '›')
  const close = el('button', { class: 'diff-hbtn diff-hclose', title: 'Close', onClick: stopAnd(opts.onClose) }, '×')
  const headerEl = el('div', { class: 'pane-header diff-header' }, prev, searchBtn, center, reload, next, close)

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
