import { test, expect } from '@playwright/test'
import { freshStateDir, launchApp, openTerminal, closeApp } from '../_harness.js'

// Pop-out windows (§2): popping a pane opens a 2nd BrowserWindow (popout.html?id)
// and the main window shows a placeholder + "Focus window". The first multi-window
// e2e — uses _electron's app.waitForEvent('window') / app.windows().
// HR-5: throwaway state dir only.

test('pop-out: a pane pops to a 2nd window + the main shows a placeholder', async () => {
  const dir = freshStateDir('crafterm-e2e-pop-')
  const { app, win } = await launchApp(dir)
  try {
    await openTerminal(win)
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
    await closeApp(app, dir)
  }
})
