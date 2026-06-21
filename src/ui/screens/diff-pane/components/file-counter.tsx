interface FileCounterHandle {
  el: HTMLSpanElement
  // Sets "idx/total" (1-based), or clears it when total is 0.
  set: (oneBasedIndex: number, total: number) => void
}

// The "3/10" file position indicator in the diff pane header.
export function createFileCounter(): FileCounterHandle {
  const el = (<span class="diff-counter" />) as HTMLSpanElement
  return {
    el,
    set: (oneBasedIndex: number, total: number) => {
      el.textContent = total ? `${oneBasedIndex}/${total}` : ''
    }
  }
}
