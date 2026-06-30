import { ShowAllMarkdownController, ShowFileFinderController } from './finders.controller'

export type { MdFile, FileFinderOptions } from './finders.types'

// ---- All markdown finder (Cmd+O in Notebook): files under the configured folders ----

export async function showAllMarkdown(): Promise<void> {
  await new ShowAllMarkdownController().run()
}

// ---- Generic file finder (Notebook "Link file"): any file under the folders ----

// In-app fuzzy file search across the configured md folders. `onPick` receives
// the chosen file (used by the notebook to link external files into its tree).
export async function showFileFinder(opts: {
  title: string
  onPick: (path: string, name: string) => void
}): Promise<void> {
  await new ShowFileFinderController(opts).run()
}
