import { createButton } from '@ui/components'
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
export function createDiffHeader(opts: DiffHeaderOptions): DiffHeaderHandle {
  const prev = createButton({
    className: 'diff-nav',
    text: '‹',
    title: 'Previous file',
    onClick: stopAnd(opts.onPrev)
  })
  const searchBtn = createButton({
    className: 'diff-hbtn',
    title: 'Find a file in this diff',
    onClick: stopAnd(opts.onToggleSearch)
  })
  searchBtn.innerHTML = SEARCH_SVG
  const htitle = (<span class="diff-path" />) as HTMLSpanElement
  const counter = createFileCounter()
  const center = (
    <div class="diff-hcenter">
      {htitle}
      {counter.el}
    </div>
  ) as HTMLDivElement
  const reload = createButton({
    className: 'diff-hbtn',
    text: '⟳',
    title: 'Reload diff',
    onClick: stopAnd(opts.onReload)
  })
  const next = createButton({
    className: 'diff-nav',
    text: '›',
    title: 'Next file',
    onClick: stopAnd(opts.onNext)
  })
  const close = createButton({
    className: 'diff-hbtn diff-hclose',
    text: '×',
    title: 'Close',
    onClick: stopAnd(opts.onClose)
  })
  const el = (
    <div class="pane-header diff-header">
      {prev}
      {searchBtn}
      {center}
      {reload}
      {next}
      {close}
    </div>
  ) as HTMLDivElement

  return {
    el,
    update: (path: string, oneBasedIndex: number, total: number) => {
      htitle.textContent = total ? path : ''
      htitle.title = htitle.textContent
      counter.set(oneBasedIndex, total)
      prev.disabled = oneBasedIndex <= 1
      next.disabled = oneBasedIndex >= total
    }
  }
}
