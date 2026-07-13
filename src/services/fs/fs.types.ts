// Filesystem domain data models (moved out of the former bridge api.d.ts).
// Covers the fs:* channels. DirEntry is shared (dir:list/plans:list/folder
// picker); MarkdownFiles is shared (fs:findFiles + markdown:findAll).
export interface DirEntry {
  name: string
  path: string
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
