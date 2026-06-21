export interface ExplorerSearchRowProps {
  name: string
  subPath: string
  onClick: (e: MouseEvent) => void
}

// A single flat file-search result row (name + dimmed parent path).
export function buildExplorerSearchRow(props: ExplorerSearchRowProps): HTMLElement {
  const row = (
    <div class="explorer-row file" style="padding-left:6px">
      <span class="explorer-tri" />
      <span class="explorer-name">{props.name}</span>
      <span class="explorer-sub">{props.subPath}</span>
    </div>
  ) as HTMLDivElement
  row.addEventListener('click', props.onClick)
  return row
}
