// Docker list row types.

export interface RowAction {
  label: string
  cls?: string
  run: () => void
}

export interface RowOptions {
  title: string
  sub: string
  meta?: string
  badge?: { text: string; cls: string }
  search: string
  actions: RowAction[]
}
