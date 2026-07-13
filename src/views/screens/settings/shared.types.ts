// Shared settings sub-tab types.

export interface SubTab {
  label: string
  build: (el: HTMLElement) => void
}

export interface SubTabsOptions {
  initialIndex?: number
  onTabChange?: (idx: number) => void
}
