import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

// Phase 8 guard: keep the CSS structure that the co-location refactor produced.
// 1. The monolithic style.css must stay deleted — no single file may grow back
//    into the catch-all stylesheet.
// 2. Design tokens (:root custom properties) live ONLY in tokens.css, so it
//    stays the single source of design truth that every component reads from.

const ROOT = process.cwd()
const SCAN_DIRS = ['src']
const SKIP_DIRS = new Set(['node_modules', 'out', 'dist', '.git'])
const TOKENS_FILE = join('src', 'ui', 'styles', 'tokens.css')

function collectCss(dir: string, acc: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      collectCss(join(dir, entry.name), acc)
    } else if (entry.name.endsWith('.css')) {
      acc.push(join(dir, entry.name))
    }
  }
}

describe('Phase 8 CSS structure guard', () => {
  it('the monolithic style.css stays deleted', () => {
    expect(existsSync(join(ROOT, 'src', 'ui', 'style.css'))).toBe(false)
  })

  it('only tokens.css defines :root design tokens', () => {
    const files: string[] = []
    for (const d of SCAN_DIRS) collectCss(join(ROOT, d), files)

    const offenders = files
      .map((abs) => relative(ROOT, abs))
      .filter((rel) => rel.split('/').join(sep) !== TOKENS_FILE)
      .filter((rel) => /:root\b/.test(readFileSync(join(ROOT, rel), 'utf8')))

    expect(offenders, `:root tokens must live only in tokens.css: ${offenders.join(', ')}`).toEqual([])
  })
})
