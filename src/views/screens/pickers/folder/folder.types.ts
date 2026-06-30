// The folder picker has no module-local types; it operates on directory entries
// from the filesystem service. Re-export that shape for structural symmetry.
export type { DirEntry } from '@services/fs/fs.types'
