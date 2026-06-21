import { ensureThemes } from '../monaco/monaco-setup'
import { configureTsOnce, ensureImportNavigation } from './code-editor.state'

// One-time global Monaco setup performed on the first editor creation: TS
// diagnostics tuning, theme registration, and the import-navigation provider.
// Idempotent — each underlying helper guards against re-running.
export function runOneTimeSetup(): void {
  configureTsOnce()
  ensureThemes()
  ensureImportNavigation()
}
