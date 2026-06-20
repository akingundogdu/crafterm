import type { GsEntry } from '../../pickers/global-search/global-search'

// Spotlight result list types.

export type SpotSource =
  | GsEntry['source']
  | 'file'
  | 'command'
  | 'claude'
  | 'shortcut'
  | 'app'
  | 'task'
  | 'reminder'
  | 'backlog'

export interface SpotEntry {
  source: SpotSource
  label: string
  detail?: string
  run: () => void
  altRun?: () => void // ⌘⏎ alternate action (e.g. split instead of open)
}

export interface ResultListHandle {
  el: HTMLDivElement
  setItems: (items: SpotEntry[], showBadge: boolean) => void
  setLoading: () => void
  move: (delta: number) => void
  selected: () => SpotEntry | undefined
}
