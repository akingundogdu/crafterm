// Docker screen (gea) types.

export type SubTab = 'containers' | 'images' | 'volumes' | 'networks' | 'compose'

// A row action button: a label, optional style class, and an injected handler.
export interface RowAction {
  label: string
  cls?: string
  run: () => void
}

// Normalized view model for a single Docker list row, built by the store per tab
// and rendered by the DockerRow component. `id` is the gea list key; `statsKey`
// (containers only) keys the live CPU/MEM stats lookup. `search` is lowercased.
export interface RowVM {
  id: string
  title: string
  sub: string
  meta?: string
  badge?: { text: string; cls: string }
  search: string
  statsKey?: string
  actions: RowAction[]
}
