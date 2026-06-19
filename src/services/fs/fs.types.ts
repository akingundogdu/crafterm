// Filesystem domain data models (moved out of the former bridge api.d.ts).
// Covers the dir:/md:/fs:/ide:/shell:/markdown: channels.
export interface DirEntry {
  name: string
  path: string
}
export interface DirListing {
  path: string
  parent: string | null
  dirs: DirEntry[]
}

export interface FsEntry {
  name: string
  path: string
  isDir: boolean
}
export interface FsEntryListing {
  path: string
  entries: FsEntry[]
}

export interface FileRef {
  path: string
  name: string
}
export interface MarkdownFiles {
  root: string
  files: FileRef[]
}

export interface ReadTextResult {
  ok: boolean
  text?: string
  error?: string
}

export interface ImportResolution {
  path: string
  line: number
}
