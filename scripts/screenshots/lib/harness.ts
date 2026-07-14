import { _electron as electron, expect, type ElectronApplication, type Page } from '@playwright/test'
import { homedir } from 'node:os'
import { buildDemoWorkspace, type DemoWorkspace } from './demo-repo.js'
import { writeMockState, type MockStateOptions } from './mock-state.js'
import { writeStubs } from './stubs.js'

// Boots the real Electron build against the generated demo workspace. Mirrors
// src/tests/e2e/_harness.ts: CRAFTERM_E2E keeps the window hidden and windowed
// (src/core/windows/index.ts), so recording never steals focus and the frames are
// independent of the developer's screen.

export const RECORD_SIZE = { width: 1600, height: 1000 }

export interface DemoApp {
  app: ElectronApplication
  win: Page
  ws: DemoWorkspace
}

export async function launchDemo(opts: MockStateOptions = {}): Promise<DemoApp> {
  const ws = buildDemoWorkspace()
  writeMockState(ws, opts)
  const stubs = writeStubs(ws)

  const app = await electron.launch({
    args: ['.'],
    env: {
      ...(process.env as Record<string, string>),
      CRAFTERM_E2E: '1',
      CRAFTERM_STATE_DIR: ws.stateDir,
      CRAFTERM_CLAUDE_DIR: ws.claudeDir,
      ZDOTDIR: ws.zshDir, // the palette reads an interactive zsh — give it the demo one
      ...stubs
    }
  })
  const win = await app.firstWindow()
  await expect(win.locator('#app')).toBeVisible({ timeout: 30_000 })

  // The app ships a 1280x800 window; recordings get a roomier frame so split panes
  // and the right-hand panel are readable in the README.
  await app.evaluate(({ BrowserWindow }, size) => {
    const w = BrowserWindow.getAllWindows()[0]
    if (w) w.setContentSize(size.width, size.height)
  }, RECORD_SIZE)

  await win.waitForTimeout(1500) // let the restored terminals spawn and paint
  return { app, win, ws }
}

export async function closeDemo(app: ElectronApplication | null): Promise<void> {
  if (app) await app.close()
}

// Nothing from the developer's machine may end up in a published frame. Scans the
// whole body — overlays (the command palette, context menus) render outside #app,
// which is exactly where a real ~/.zshrc alias list would have shown up.
export async function assertNoPrivateData(win: Page): Promise<void> {
  const text = await win.locator('body').innerText()
  const home = homedir()
  const user = home.split('/').pop() ?? ''
  const leaks: [string, string][] = [
    ['the home path', home],
    ['a real /Users path', '/Users/'],
    ['the username', user]
  ]
  for (const [what, needle] of leaks) {
    if (needle && text.includes(needle)) throw new Error(`${what} leaked into a recorded frame: ${needle}`)
  }
}

// Cmd-shortcuts can race window focus on the first press; retry like the e2e specs do.
export async function openWithShortcut(win: Page, combo: string, selector: string): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await win.keyboard.press(combo)
    if (await win.locator(selector).first().isVisible().catch(() => false)) return
    await win.waitForTimeout(400)
  }
  await expect(win.locator(selector).first()).toBeVisible({ timeout: 5000 })
}

export async function closeOverlays(win: Page): Promise<void> {
  for (let i = 0; i < 3; i++) {
    if ((await win.locator('.modal-overlay').count()) === 0) return
    await win.keyboard.press('Escape')
    await win.waitForTimeout(200)
  }
}
