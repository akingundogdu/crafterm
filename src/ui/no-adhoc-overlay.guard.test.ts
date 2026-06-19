import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

// Phase 7 guard: the `.modal-overlay` backdrop must be built by the single
// source of truth in @crafterm/ui (createOverlay). Any other module that
// hand-rolls `className = 'modal-overlay'` / `classList.add('modal-overlay')`
// reintroduces the duplicated modal scaffolding Phase 7 removed, so this test
// fails the moment such a pattern reappears.

const ROOT = process.cwd()
const SCAN_DIRS = ['src', 'packages']
const SKIP_DIRS = new Set(['node_modules', 'out', 'dist', '.git'])

// The only place allowed to construct the overlay element directly.
const ALLOWED = new Set([join('packages', 'crafterm-ui', 'src', 'overlay', 'overlay.ts')])

const ADHOC_OVERLAY =
  /(className\s*=\s*['"`][^'"`]*\bmodal-overlay\b|classList\.add\(\s*['"`]modal-overlay['"`])/

function collectTsFiles(dir: string, acc: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      collectTsFiles(join(dir, entry.name), acc)
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      acc.push(join(dir, entry.name))
    }
  }
}

describe('Phase 7 dedup guard', () => {
  it('only @crafterm/ui createOverlay constructs a .modal-overlay backdrop', () => {
    const files: string[] = []
    for (const d of SCAN_DIRS) collectTsFiles(join(ROOT, d), files)

    const offenders = files
      .map((abs) => relative(ROOT, abs))
      .filter((rel) => !ALLOWED.has(rel.split('/').join(sep)))
      .filter((rel) => ADHOC_OVERLAY.test(readFileSync(join(ROOT, rel), 'utf8')))

    expect(offenders, `ad-hoc modal-overlay must route through createOverlay: ${offenders.join(', ')}`).toEqual([])
  })
})
