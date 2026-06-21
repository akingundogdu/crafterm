interface EnvironmentChipsProps {
  environments: string[]
  selected: string
  onSelect: (name: string) => void
}

// Environment button bar: one chip per environment, the selected one marked
// `active`. Clicking a chip updates the active class locally and reports the new
// selection via `onSelect` so the owner can re-render dependent UI.
export function environmentChips({
  environments,
  selected,
  onSelect
}: EnvironmentChipsProps): HTMLDivElement {
  const envBar = (<div class="run-env-bar" />) as HTMLDivElement
  const envBtns: HTMLButtonElement[] = []
  environments.forEach((name) => {
    const b = (
      <button class={'run-env-chip' + (name === selected ? ' active' : '')}>{name}</button>
    ) as HTMLButtonElement
    b.addEventListener('click', () => {
      envBtns.forEach((x) => x.classList.toggle('active', x === b))
      onSelect(name)
    })
    envBtns.push(b)
    envBar.appendChild(b)
  })
  return envBar
}
