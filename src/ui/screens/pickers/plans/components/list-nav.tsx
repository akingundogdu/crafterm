import type { DirEntry } from '@services/fs/fs.types'

interface ListNavProps {
  getItems: () => DirEntry[]
  getSelected: () => number
  setSelected: (index: number) => void
  onHighlight: () => void
  onChoose: (plan: DirEntry) => void
  onClose: () => void
}

// Attaches the input's arrow/enter/escape navigation. Selection state lives in
// the parent and is read/written through the supplied getters/callbacks.
export function attachListNav(input: HTMLInputElement, props: ListNavProps): void {
  input.addEventListener('keydown', (e) => {
    e.stopPropagation()
    const items = props.getItems()
    if (e.key === 'Escape') props.onClose()
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      props.setSelected(Math.min(items.length - 1, props.getSelected() + 1))
      props.onHighlight()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      props.setSelected(Math.max(0, props.getSelected() - 1))
      props.onHighlight()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const selected = items[props.getSelected()]
      if (selected) props.onChoose(selected)
    }
  })
}
