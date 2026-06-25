import { test, expect } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { freshStateDir, launchApp, closeApp } from '../_harness.js'

// Terminal-pane runtime + appearance (§2.81 CRAFTERM_PANE_ID env injection, §2.35
// global background applied to the live pane). Real zsh spawns (CRAFTERM_E2E only
// disables window chrome). HR-5: throwaway state dir only.
//
// Deferred (documented, not flakily forced): §2.7 Shift/Alt+Enter (zsh multi-line
// continuation has no clean deterministic DOM assertion; the handler is pure but
// terminal.state.ts imports @xterm/xterm at runtime so a unit test needs a logic
// extraction), §2.15 notify-throttle 2s (timing-heavy; cards carry no pane id),
// §2.76 tab-scroll-preserve (xterm canvas-internal, no app code), §2.18
// claudeSpawnedAt two-panes race (nondeterministic).

function writeState(dir: string, state: Record<string, any>): void {
  writeFileSync(join(dir, 'crafterm-state.json'), JSON.stringify({ schemaVersion: 4, ...state }))
}

test('terminal-env: $CRAFTERM_PANE_ID echoes the pane stable UUID', async () => {
  const dir = freshStateDir('crafterm-e2e-tenv-')
  const PANE_UUID = '11111111-2222-4333-8444-555555555555'
  // a seeded leaf's stableId is injected as CRAFTERM_PANE_ID at pty spawn.
  writeState(dir, {
    tree: [
      { kind: 'tab', title: 'EnvPane', titleLocked: false, color: null, pinned: false, status: 'idle',
        root: { type: 'leaf', stableId: PANE_UUID, cwd: dir } }
    ]
  })
  const { app, win } = await launchApp(dir)
  try {
    await expect(win.locator('.pane-box')).toHaveCount(1)
    await win.locator('.pane-term').first().click() // focus the xterm
    await win.keyboard.type('echo $CRAFTERM_PANE_ID')
    await win.keyboard.press('Enter')
    // the expanded UUID appears in the output (the typed line has only the var name)
    await expect(win.locator('.pane-box.active .xterm-rows')).toContainText(PANE_UUID, { timeout: 10_000 })
  } finally {
    await closeApp(app, dir)
  }
})

test('terminal-env: a global Background change updates the live pane', async () => {
  const dir = freshStateDir('crafterm-e2e-tenv-')
  writeState(dir, { tree: [] }) // default → one starter terminal pane
  const { app, win } = await launchApp(dir)
  try {
    await expect(win.locator('.pane-box')).toHaveCount(1)

    await win.locator('#settings-btn').click()
    const modal = win.locator('.modal.settings-modal')
    await expect(modal).toBeVisible({ timeout: 10_000 })
    await modal.locator('.settings-nav-item', { hasText: 'Appearance' }).click()

    // a clearly non-default preset (BG_PRESETS[5] = #1a1b26); read its rgb, not hardcode
    const swatch = modal.locator('.settings-panel:visible .bg-swatch').nth(5)
    const target = await swatch.evaluate((el) => getComputedStyle(el).backgroundColor)
    await swatch.click()

    // applyBackground → applyAppearance → applyPaneTheme writes the pane's bg live.
    // (The live-pane update IS §2.35; settings.bgColor persistence is a §9 concern
    // already round-tripped by persistence.spec, so it's not re-asserted here.)
    await expect(win.locator('.pane-box').first()).toHaveCSS('background-color', target, { timeout: 5_000 })
  } finally {
    await closeApp(app, dir)
  }
})
