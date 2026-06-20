// A markdown / file finder entry.
export interface MdFile {
  path: string
  name: string
}

// Options for the generic file finder (Notebook "Link file").
export interface FileFinderOptions {
  title: string
  onPick: (path: string, name: string) => void
}
