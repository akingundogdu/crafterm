export interface DirEntry {
  name: string
  path: string
  isDir: boolean
}

export interface FileRef {
  path: string
  name: string
}

export type ReadTextResult = { ok: true; text: string } | { ok: false; error: string }
