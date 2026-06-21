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
  const drill = (
    <button
      class="picker-drill"
      title={UITexts.Pickers.folder.enterFolder}
      onClick={(e: MouseEvent) => {
        e.stopPropagation()
        onDrill()
      }}
    >
      ›
    </button>
  ) as HTMLButtonElement
  const row = (
    <div class={'pick-row picker-row' + (isActive ? ' active' : '')} onClick={onSelect}>
      <span class="picker-name">{name}</span>
      {drill}
    </div>
  ) as HTMLDivElement
  row.addEventListener('mouseenter', onHover)
  return row
}
