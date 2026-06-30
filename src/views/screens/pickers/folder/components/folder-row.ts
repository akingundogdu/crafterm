import { el } from '@views/lib/dom'
import { UITexts } from '@texts'

interface FolderRowProps {
  name: string
  isActive: boolean
  onSelect: () => void
  onDrill: () => void
  onHover: () => void
}

// One folder row: the folder name plus a drill-into (`›`) button. Pure factory —
// selection index, list state, and navigation stay in the parent.
export function folderRow({ name, isActive, onSelect, onDrill, onHover }: FolderRowProps): HTMLDivElement {
  const drill = el(
    'button',
    {
      class: 'picker-drill',
      title: UITexts.Pickers.folder.enterFolder,
      onClick: (e: MouseEvent) => {
        e.stopPropagation()
        onDrill()
      }
    },
    '›'
  )
  const row = el(
    'div',
    { class: 'pick-row picker-row' + (isActive ? ' active' : ''), onClick: onSelect },
    el('span', { class: 'picker-name' }, name),
    drill
  )
  row.addEventListener('mouseenter', onHover)
  return row
}
