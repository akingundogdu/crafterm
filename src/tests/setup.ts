import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll } from 'vitest'

// HR-5: tests must NEVER touch the live ~/.crafterm (state.json, notebooks,
// todo-list.json) or ~/.crafterm-dev. Redirect all state to a throwaway temp dir
// BEFORE any module reads it, and hard-fail if it ever points at the real dir.
const dir = mkdtempSync(join(tmpdir(), 'crafterm-test-'))
process.env.CRAFTERM_STATE_DIR = dir

if (/\.crafterm(-dev)?(\/|$)/.test(process.env.CRAFTERM_STATE_DIR)) {
  throw new Error(
    `HR-5 violated: CRAFTERM_STATE_DIR must be a temp dir, not the real state dir (got: ${dir})`
  )
}

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})
