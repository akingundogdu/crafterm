import { el } from '@views/lib/dom'

export interface ExplorerSearchRowProps {
  name: string
  subPath: string
  onClick: (e: MouseEvent) => void
}

// A single flat file-search result row (name + dimmed parent path). Plain-DOM
// (el()) port of the legacy JSX factory — the explorer is an imperative widget,
// so gea reactivity buys nothing here (§2.7 self-contained, no @ui).
export function buildExplorerSearchRow(props: ExplorerSearchRowProps): HTMLElement {
  return el(
    'div',
    { class: 'explorer-row file', style: 'padding-left:6px', onClick: props.onClick as EventListener },
    el('span', { class: 'explorer-tri' }),
    el('span', { class: 'explorer-name' }, props.name),
    el('span', { class: 'explorer-sub' }, props.subPath)
  )
}
