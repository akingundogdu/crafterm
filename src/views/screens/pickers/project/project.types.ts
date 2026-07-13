// Project picker entry: a row that can open in a new tab or a split.
export interface Entry {
  label: string
  sub?: string
  openTab: () => void
  openSplit: () => void
}
