interface CategoryChipsProps {
  container: HTMLDivElement
  categories: string[]
  active: Set<string>
  onToggle: (category: string) => void
}

export function renderCategoryChips({
  container,
  categories,
  active,
  onToggle
}: CategoryChipsProps): void {
  container.replaceChildren()
  categories.forEach((cat) => {
    const chip = (
      <button class={'picker-markdown-chip' + (active.has(cat) ? ' active' : '')}>{cat}</button>
    ) as HTMLButtonElement
    chip.addEventListener('click', () => onToggle(cat))
    container.appendChild(chip)
  })
}
