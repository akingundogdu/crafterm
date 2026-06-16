import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'

// terminal.manager end-to-end through the real Electron main process: the
// renderer bridge (window.crafterm.terminal.createPty/input/onData/kill) → pty:* IPC →
// node-pty → owner routing back to the renderer. Proves the extracted manager
// spawns a real shell, pipes bytes both ways, and tears down on kill.
// HR-5: throwaway state dir, never the real ~/.crafterm.

function freshDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'crafterm-e2e-terminal-'))
  if (/\.crafterm(-dev)?(\/|$)/.test(d)) throw new Error('HR-5 violated: refusing real state dir')
  return d
}

async function launch(dir: string): Promise<{ app: ElectronApplication; win: Page }> {
  const app = await electron.launch({ args: ['.'], env: { ...process.env, CRAFTERM_STATE_DIR: dir } })
  const win = await app.firstWindow()
  await expect(win.locator('#app')).toBeVisible({ timeout: 30_000 })
  return { app, win }
}

test('terminal: spawn a real pty, echo a token round-trips, kill tears it down', async () => {
  const dir = freshDir()
  let app: ElectronApplication | null = null
  try {
    const s = await launch(dir)
    app = s.app
    const win = s.win

    // Register accumulators BEFORE creating the pty, then spawn and grab its id.
    const id = await win.evaluate(async () => {
      const w = window as unknown as { __pty: { buf: Record<string, string>; exited: string[] } }
      w.__pty = { buf: {}, exited: [] }
      window.crafterm.terminal.onData((pid, data) => {
        w.__pty.buf[pid] = (w.__pty.buf[pid] || '') + data
      })
      window.crafterm.terminal.onExit((pid) => {
        w.__pty.exited.push(pid)
      })
      return window.crafterm.terminal.createPty({})
    })
    expect(id).toBeTruthy()

    const token = `CRAFTERM_E2E_${Date.now()}`

    await test.step('typed command pipes through the shell and back', async () => {
      await win.evaluate((a) => window.crafterm.terminal.input(a.id, `echo ${a.token}\n`), { id, token })
      await expect
        .poll(() => win.evaluate((pid) => (window as unknown as { __pty: { buf: Record<string, string> } }).__pty.buf[pid] || '', id), {
          timeout: 15_000
        })
        .toContain(token)
    })

    await test.step('resize does not crash the pty', async () => {
      await win.evaluate((pid) => window.crafterm.terminal.resize(pid, 100, 30), id)
      // Still alive: another echo still round-trips after the resize.
      const token2 = `${token}_AFTER_RESIZE`
      await win.evaluate((a) => window.crafterm.terminal.input(a.id, `echo ${a.token}\n`), { id, token: token2 })
      await expect
        .poll(() => win.evaluate((pid) => (window as unknown as { __pty: { buf: Record<string, string> } }).__pty.buf[pid] || '', id), {
          timeout: 15_000
        })
        .toContain(token2)
    })

    await test.step('kill fires pty:exit for that pane', async () => {
      await win.evaluate((pid) => window.crafterm.terminal.kill(pid), id)
      await expect
        .poll(() => win.evaluate((pid) => (window as unknown as { __pty: { exited: string[] } }).__pty.exited.includes(pid), id), {
          timeout: 15_000
        })
        .toBe(true)
    })
  } finally {
    if (app) await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
