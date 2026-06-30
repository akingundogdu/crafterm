import type { GsEntry } from '@ui/screens/pickers/global-search/global-search'

// Spotlight result list types. GsEntry is sourced from the (un-migrated) global
// search picker — the spine's "All" tab is built on that index, so the @ui import
// is unremovable until the pickers subsystem is ported.

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
