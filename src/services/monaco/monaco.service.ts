import { join } from 'path'
import { existsSync, readFileSync } from 'fs'
import { monacoThemesDir } from '@core/services/paths/paths.service'

// Monaco theme domain logic (monaco:*): load a bundled monaco-themes theme JSON by
// display name. No IPC wiring (that's MonacoController in monaco.main.ts).
export class MonacoService {
  // Read a monaco-themes theme JSON by display name (e.g. "Monokai"). Ships via
  // extraResources when packaged; reads from node_modules in dev. Returns the
  // parsed IStandaloneThemeData, or null on any failure / bad name.
  theme(name: string): Record<string, unknown> | null {
    if (!name || name.includes('/') || name.includes('..')) return null
    try {
      const p = join(monacoThemesDir(), `${name}.json`)
      if (!existsSync(p)) return null
      return JSON.parse(readFileSync(p, 'utf8'))
    } catch {
      return null
    }
  }
}
