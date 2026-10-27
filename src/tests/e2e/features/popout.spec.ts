import { test, expect } from '@playwright/test'
import { freshStateDir, launchApp, openTerminal, readState, closeApp } from '../_harness.js'

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

// A popped-out pane is saved as popped out with its window bounds, so a restart
// reopens the pop-out window in the same place.
test('pop-out: a popped-out pane reopens in its window, in place, after a restart', async () => {
  const dir = freshStateDir('crafterm-e2e-pop-restore-')
  let { app, win } = await launchApp(dir)
  const savedPopout = (): { bounds?: { x: number; y: number; width: number; height: number } } | null => {
    const walk = (n: any): any[] => (!n ? [] : n.type === 'leaf' ? [n] : (n.children ?? []).flatMap(walk))
    const tabs = (nodes: any[]): any[] => (nodes ?? []).flatMap((n) => (n.kind === 'tab' ? [n] : tabs(n.children)))
    const leaf = tabs(readState(dir)?.tree ?? [])
      .flatMap((t) => walk(t.root))
      .find((l) => l.popout)
    return leaf?.popout ?? null
  }
  try {
    await openTerminal(win)
    await win.locator('.pane-box.active .pane-btn').click()
    const popoutOpened = app.waitForEvent('window')
    await win.locator('.context-menu').getByRole('button', { name: 'Pop out to window', exact: true }).click()
    await popoutOpened

    let saved: { x: number; y: number; width: number; height: number } | undefined
    await test.step('the leaf is saved as popped out, with the window bounds', async () => {
      await expect.poll(() => savedPopout()?.bounds ?? null, { timeout: 5_000 }).not.toBe(null)
      saved = savedPopout()!.bounds
    })

    await test.step('a relaunch reopens the pop-out window at the saved bounds', async () => {
      await app.close()
      ;({ app, win } = await launchApp(dir))
      await expect.poll(() => app.windows().length, { timeout: 20_000 }).toBe(2)
      const popout = app.windows().find((w) => w.url().includes('popout'))!
      await expect(popout.locator('#popout-term .xterm')).toBeAttached({ timeout: 20_000 })
      const bounds = await app.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows().find((b) => b.webContents.getURL().includes('popout'))
        return w?.getBounds() ?? null
      })
      expect(bounds).toEqual(saved)
    })
  } finally {
    await closeApp(app, dir)
  }
})
