import { el } from '@views/lib/dom'
import { baseName } from '../../shared'
import { ALL_FOLDERS } from '../finders.state'

export interface FilterChips {
  bar: HTMLDivElement
  chips: HTMLButtonElement[]
}

// The folder filter chip bar used by both finders: an "All" chip followed by one
// chip per configured folder. Each chip's click hands its value and element back
// to the parent, which owns the active-chip toggle and the actual load.
export function filterChips(
  folders: string[],
  onPick: (value: string, chip: HTMLButtonElement) => void
): FilterChips {
  const bar = el('div', { class: 'md-filters' })
  const chips: HTMLButtonElement[] = []
  const makeChip = (label: string, value: string): void => {
    const c = el(
      'button',
      {
        class: 'picker-markdown-chip',
        title: value === ALL_FOLDERS ? 'All configured folders' : value,
        onClick: () => onPick(value, c)
      },
      label
    )
    bar.appendChild(c)
    chips.push(c)
  }
  if (folders.length) {
    makeChip('All', ALL_FOLDERS)
    folders.forEach((f) => makeChip(baseName(f), f))
  }
  return { bar, chips }
}
