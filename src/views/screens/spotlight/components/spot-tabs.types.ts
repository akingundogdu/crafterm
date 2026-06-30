// Spotlight tab bar types.

export interface SpotTab {
  id: string
  label: string
}

export interface SpotTabsHandle {
  el: HTMLDivElement
  render: () => void
}
