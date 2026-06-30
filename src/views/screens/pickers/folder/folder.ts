import { FolderPickerController, FolderDashboardController } from './folder.controller'

// ---- Pick a folder (returns its path) — used by Settings to choose md folders ----
export function pickFolderPath(startDir?: string): Promise<string | null> {
  return new Promise((resolve) => {
    new FolderPickerController(startDir, resolve).open()
  })
}

// ---- Cmd+P: browse folders from the code root, open one in a new terminal ----
export async function showFolderPicker(): Promise<void> {
  return new FolderDashboardController().open()
}
