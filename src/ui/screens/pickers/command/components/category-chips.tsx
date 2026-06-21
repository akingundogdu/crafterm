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
      <button
        class={'picker-markdown-chip' + (active.has(cat) ? ' active' : '')}
        onClick={() => onToggle(cat)}
      >
        {cat}
      </button>
    ) as HTMLButtonElement
    container.appendChild(chip)
  })
}
