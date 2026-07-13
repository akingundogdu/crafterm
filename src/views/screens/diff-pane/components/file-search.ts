import type { FileSearchHandle, FileSearchOptions } from './file-search.types'
import { FileSearchController } from './file-search.controller'

export type { FileSearchHandle } from './file-search.types'

// Searchable file-list dropdown for the diff pane. Filters the diff's files by a
// substring of their path and jumps to the picked file. Pure — the file list,
// the active index, and the pick handler are injected, so it renders and filters
// in isolation.
export function createFileSearch(opts: FileSearchOptions): FileSearchHandle {
  return new FileSearchController(opts).build()
}
