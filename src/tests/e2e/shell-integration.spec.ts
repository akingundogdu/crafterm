import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// Phase 3 end-to-end: the ZDOTDIR shim (features.md §9 "ZDOTDIR shim + zsh
// preexec last-cmd capture") is generated from script templates at startup. The
// golden unit tests prove loadScript's output is byte-identical, but only the
// real app proves setupShellIntegration() resolves the templates dir
// (scriptsDir()/templates) and actually writes the shim files. If template
// resolution broke, the shim would silently fail (try/catch) and command-history
// capture would stop working — this spec catches that. HR-5: throwaway dir.

test('startup writes the ZDOTDIR shim from templates into the state dir', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'crafterm-e2e-shim-'))
  if (/\.crafterm(-dev)?(\/|$)/.test(dir)) throw new Error('HR-5 violated: refusing real state dir')

  let app: ElectronApplication | null = null
  try {
    app = await electron.launch({ args: ['.'], env: { ...process.env, CRAFTERM_E2E: '1', CRAFTERM_STATE_DIR: dir } })
    const win = await app.firstWindow()
    await expect(win.locator('#app')).toBeVisible({ timeout: 30_000 })

    const zdot = join(dir, 'zdotdir')
    // shim setup runs at module init; poll briefly in case it lands just after boot
    await expect.poll(() => existsSync(join(zdot, '.zshrc')), { timeout: 10_000 }).toBe(true)

    const zshrc = readFileSync(join(zdot, '.zshrc'), 'utf8')
    const zshenv = readFileSync(join(zdot, '.zshenv'), 'utf8')
    const zprofile = readFileSync(join(zdot, '.zprofile'), 'utf8')

    // .zshrc carries the preexec hook that records the last command per pane,
    // pointed at <stateDir>/last-cmd (the cmdDir token, substituted in the app).
    expect(zshrc).toContain('crafterm_preexec()')
    expect(zshrc).toContain('preexec_functions+=(crafterm_preexec)')
    expect(zshrc).toContain(join(dir, 'last-cmd'))
    // .zshenv snapshots/reasserts ZDOTDIR; .zprofile sources the user's rc.
    expect(zshenv).toContain('CRAFTERM_ZDOTDIR="$ZDOTDIR"')
    expect(zprofile).toContain('source "${USER_ZDOTDIR:-$HOME}/.zprofile"')
  } finally {
    if (app) await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
