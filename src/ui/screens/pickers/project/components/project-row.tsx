interface ProjectRowProps {
  label: string
  sub?: string
  active: boolean
  onClick: (split: boolean) => void
  onHover: () => void
}

export function projectRow({ label, sub, active, onClick, onHover }: ProjectRowProps): HTMLDivElement {
  const row = (
    <div
      class={'pick-row project-row' + (active ? ' active' : '')}
      onClick={(ev: MouseEvent) => onClick(ev.metaKey || ev.ctrlKey)}
    >
      <span class="picker-name">{label}</span>
      {sub && <span class="project-sub">{sub}</span>}
    </div>
  ) as HTMLDivElement
  row.addEventListener('mouseenter', onHover)
  return row
}
