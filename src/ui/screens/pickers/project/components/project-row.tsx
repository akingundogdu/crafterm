interface ProjectRowProps {
  label: string
  sub?: string
  active: boolean
  onClick: (split: boolean) => void
  onHover: () => void
}

export function projectRow({ label, sub, active, onClick, onHover }: ProjectRowProps): HTMLDivElement {
  const row = (
    <div class={'pick-row project-row' + (active ? ' active' : '')}>
      <span class="picker-name">{label}</span>
      {sub && <span class="project-sub">{sub}</span>}
    </div>
  ) as HTMLDivElement
  row.addEventListener('click', (ev) => onClick(ev.metaKey || ev.ctrlKey))
  row.addEventListener('mouseenter', onHover)
  return row
}
