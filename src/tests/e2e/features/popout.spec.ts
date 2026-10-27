import { test, expect } from '@playwright/test'
import { freshStateDir, launchApp, openTerminal, closeApp } from '../_harness.js'

// Pop-out windows (§2): popping a pane opens a 2nd BrowserWindow (popout.html?id).
// A popped-out pane leaves the main-window layout entirely so it frees its space —
// when it was the tab's only pane the content area falls back to the empty/composer
// state. The first multi-window e2e — uses _electron's app.waitForEvent('window') /
// app.windows(). HR-5: throwaway state dir only.

test('pop-out: the only pane pops to a 2nd window and frees the content area', async () => {
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

    await test.step('no space-filling placeholder — the empty/composer state shows instead', async () => {
      await expect(win.locator('.pane-popped')).toHaveCount(0)
      await expect(win.locator('.agent-composer')).toBeVisible()
    })

    await test.step('the pop-out window adopts the terminal (xterm mounts)', async () => {
      await expect(popout.locator('#popout-term .xterm')).toBeAttached({ timeout: 20_000 })
    })
  } finally {
    await closeApp(app, dir)
  }
})

// Pop-out from the side-by-side (tiled) view: each tile shows a dedicated pop-out
// button in its header (hidden on normal panes), so a tiled terminal can be
// detached into its own window without going through the ⋯ menu.
test('pop-out: a side-by-side tile pops out via its header button', async () => {
  const dir = freshStateDir('crafterm-e2e-pop-sbs-')
  const { app, win } = await launchApp(dir)
  try {
    // Two terminals, each in its own tab (sidebar rows are gea tree cards).
    await openTerminal(win)
    await win.locator('#new-tab').click()
    const rows = win.locator('#tab-list .crtree-card')
    await expect(rows).toHaveCount(2, { timeout: 15_000 })

    // Cmd+click both rows to mark them for the tiled view, then enter it from the
    // row's context menu.
    await rows.nth(0).click({ modifiers: ['Meta'] })
    await rows.nth(1).click({ modifiers: ['Meta'] })
    await rows.nth(1).click({ button: 'right' })
    await win.locator('.context-menu').getByText(/terminals side by side/).click()

    // The tile pop-out button is only visible inside the side-by-side grid.
    const tileBtn = win.locator('.side-by-side-grid .pane-box .pane-popout').first()
    await expect(tileBtn).toBeVisible({ timeout: 15_000 })

    const popoutOpened = app.waitForEvent('window')
    await tileBtn.click()

    const popout = await popoutOpened
    expect(popout.url()).toContain('popout')
    expect(app.windows().length).toBe(2)

    await test.step('the popped tile frees its slot — the remaining tile fills, no placeholder', async () => {
      await expect(win.locator('.side-by-side-grid .pane-popped')).toHaveCount(0)
      await expect(win.locator('.side-by-side-grid .pane-box')).toHaveCount(1)
    })
  } finally {
    await closeApp(app, dir)
  }
})
