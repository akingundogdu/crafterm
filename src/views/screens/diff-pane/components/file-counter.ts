import { el } from '@views/lib/dom'

interface FileCounterHandle {
  el: HTMLSpanElement
  // Sets "idx/total" (1-based), or clears it when total is 0.
  set: (oneBasedIndex: number, total: number) => void
}

// The "3/10" file position indicator in the diff pane header. Plain-DOM (el())
// port of the legacy JSX factory (§2.7 self-contained, no @ui).
export function createFileCounter(): FileCounterHandle {
  const counterEl = el('span', { class: 'diff-counter' })
  return {
    el: counterEl,
    set: (oneBasedIndex: number, total: number) => {
      counterEl.textContent = total ? `${oneBasedIndex}/${total}` : ''
    }
  }
}
