import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { freshStateDir, launchApp, closeApp } from '../_harness.js'

// CRF-21: the status-bar resource chip reads the real machine (vm_stat / sysctl /
// ps through the system:* channels) and its popover lists the heaviest apps. This
// spec drives the real build, so it also proves the IPC wiring end to end.
let stateDir = ''
let app: ElectronApplication | null = null
let win: Page

test.beforeAll(async () => {
  stateDir = freshStateDir()
  const launched = await launchApp(stateDir)
  app = launched.app
  win = launched.win
})

test('the chip shows live CPU + RAM percentages beside the sidebar toggle', async () => {
  const chip = win.locator('.resource-chip')
  await expect(chip).toBeVisible({ timeout: 15_000 })
  // Both readouts land once the first metrics poll returns.
  await expect(chip.locator('.resource-chip-value').first()).toHaveText(/%$/, { timeout: 15_000 })
  await expect(chip.locator('.resource-chip-value').nth(1)).toHaveText(/%$/)
  // The chip sits at the left end, right after the sidebar toggle.
  await expect(win.locator('#content-statusbar > *').nth(1)).toHaveAttribute(
    'id',
    'statusbar-resource-chip'
  )
})

test('clicking the chip opens a popover with meters and top applications', async () => {
  await win.locator('.resource-chip').click()
  const popover = win.locator('.resource-popover')
  await expect(popover).toBeVisible({ timeout: 15_000 })
  // CPU + memory always; swap only when the machine is swapping.
  await expect(popover.locator('.resource-popover-meter')).not.toHaveCount(0)
  await expect(popover.locator('.resource-popover-breakdown-row')).toHaveCount(4)
  await expect(popover.locator('.resource-process-row').first()).toBeVisible({ timeout: 15_000 })
})

test('sorting by memory reorders the application list', async () => {
  const popover = win.locator('.resource-popover')
  await popover.getByText('Top memory').click()
  await expect(popover.locator('.resource-popover-sort.active')).toHaveText('Top memory')
  await expect(popover.locator('.resource-process-row').first()).toBeVisible()
})

test('user-owned applications carry quit actions, revealed on hover', async () => {
  const rows = win.locator('.resource-popover .resource-process-row')
  // Rendered for every quittable app (hidden until the row is hovered); a
  // root-owned daemon or Crafterm itself carries none.
  await expect(rows.locator('.resource-process-row-action').first()).toHaveCount(1)
  const first = rows.filter({ has: win.locator('.resource-process-row-action') }).first()
  await first.hover()
  await expect(first.locator('.resource-process-row-action').first()).toBeVisible()
  await expect(first.locator('.resource-process-row-action')).toHaveCount(2)
})

test('clicking the chip again closes the popover', async () => {
  await win.locator('.resource-chip').click()
  await expect(win.locator('.resource-popover')).toBeHidden()
})

test.afterAll(async () => {
  await closeApp(app, stateDir)
})
