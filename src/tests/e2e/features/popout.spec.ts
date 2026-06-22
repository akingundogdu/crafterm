import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'

// Pop-out windows (§2): popping a pane opens a 2nd BrowserWindow (popout.html?id)
// and the main window shows a placeholder + "Focus window". The first multi-window
// e2e — uses _electron's app.waitForEvent('window') / app.windows().
// HR-5: throwaway state dir only.

function freshStateDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'crafterm-e2e-pop-'))
  if (/\.crafterm(-dev)?(\/|$)/.test(dir)) throw new Error('HR-5 violated: refusing real state dir')
  return dir
}
async function launch(dir: string): Promise<{ app: ElectronApplication; win: Page }> {
  const app = await electron.launch({ args: ['.'], env: { ...process.env, CRAFTERM_E2E: '1', CRAFTERM_STATE_DIR: dir } })
  const win = await app.firstWindow()
  await expect(win.locator('#app')).toBeVisible({ timeout: 30_000 })
  return { app, win }
}

test('pop-out: a pane pops to a 2nd window + the main shows a placeholder', async () => {
  const dir = freshStateDir()
  const { app, win } = await launch(dir)
  try {
    await expect(win.locator('.pane-box')).toHaveCount(1) // starter terminal
    await win.locator('.pane-box.active .pane-btn').click()
    const popoutOpened = app.waitForEvent('window')
    await win.locator('.context-menu').getByRole('button', { name: 'Pop out to window', exact: true }).click()

    const popout = await popoutOpened
    expect(popout.url()).toContain('popout')
    expect(app.windows().length).toBe(2)

    await test.step('main window shows the placeholder + Focus window', async () => {
      await expect(win.locator('.pane-popped-label')).toContainText('separate window')
      await expect(win.locator('.pane-popped button.settings-inline-btn')).toHaveText('Focus window')
    })

    await test.step('the pop-out window adopts the terminal (xterm mounts)', async () => {
      await expect(popout.locator('#popout-term .xterm')).toBeAttached({ timeout: 20_000 })
    })
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
