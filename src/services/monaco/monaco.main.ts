import { ipcMain } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync } from 'fs'
import { monacoThemesDir } from '@core/services/paths'

// Monaco bridge (monaco:*): load a monaco-themes theme JSON by display name.
export function registerMonacoIpc(): void {
  // Read a monaco-themes theme JSON by display name (e.g. "Monokai"). Ships via
  // extraResources when packaged; reads from node_modules in dev. Returns the
  // parsed IStandaloneThemeData, or null on any failure / bad name.
  ipcMain.handle('monaco:theme', (_e, { name }: { name: string }) => {
    if (!name || name.includes('/') || name.includes('..')) return null
    try {
      const p = join(monacoThemesDir(), `${name}.json`)
      if (!existsSync(p)) return null
      return JSON.parse(readFileSync(p, 'utf8'))
    } catch {
      return null
    }
  })
}
