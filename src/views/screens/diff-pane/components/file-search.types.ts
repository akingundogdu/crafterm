import type { FileDiff } from '../parse-diff'

export interface FileSearchHandle {
  el: HTMLDivElement
  open: () => void
  close: () => void
  toggle: () => void
  isOpen: () => boolean
}

export interface FileSearchOptions {
  getFiles: () => FileDiff[]
  getActiveIdx: () => number
  onPick: (idx: number) => void
}
