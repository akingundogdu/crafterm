import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Phase 3 (HR-4): shell-command bodies live in resources/scripts/templates/*.tmpl
// with {{token}} placeholders instead of inline strings. `loadScript` reads a
// template and substitutes every token; an unreplaced `{{…}}` left behind throws
// (catches typos / missing vars). The caller passes the resolved templates dir
// (main resolves it via scriptsDir(); tests point at the repo's resources/) so
// this module needs no Electron import and stays unit-testable.

export function loadScript(
  templatesDir: string,
  name: string,
  vars: Record<string, string> = {}
): string {
  let out = readFileSync(join(templatesDir, name), 'utf8')
  for (const [key, value] of Object.entries(vars)) {
    out = out.split(`{{${key}}}`).join(value)
  }
  const leftover = out.match(/\{\{[^}]+\}\}/)
  if (leftover) {
    throw new Error(`loadScript(${name}): unreplaced placeholder ${leftover[0]}`)
  }
  return out
}
