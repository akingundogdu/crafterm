// Directory-listing domain types (dir:* channels). DirEntry is shared (also used
// by plans:list + the folder picker) and stays in fs.types; a DirListing is the
// folder picker's one-level view.
import type { DirEntry } from '../fs/fs.types'

export interface DirListRequest {
  path?: string
}

export interface DirListing {
  path: string
  parent: string | null
  dirs: DirEntry[]
}
