import { Component } from '@geajs/core'

interface FileCounterHandle {
  el: HTMLSpanElement
  // Sets "idx/total" (1-based), or clears it when total is 0.
  set: (oneBasedIndex: number, total: number) => void
}

// The "3/10" file position indicator in the diff pane header. A gea Component
// builds the node; the factory returns it plus an imperative `set`.
class FileCounterView extends Component {
  template() {
    return <span class="diff-counter" />
  }
}

export function createFileCounter(): FileCounterHandle {
  const host = document.createElement('div')
  new FileCounterView().render(host)
  const counterEl = host.firstElementChild as HTMLSpanElement
  return {
    el: counterEl,
    set: (oneBasedIndex: number, total: number) => {
      counterEl.textContent = total ? `${oneBasedIndex}/${total}` : ''
    }
  }
}
