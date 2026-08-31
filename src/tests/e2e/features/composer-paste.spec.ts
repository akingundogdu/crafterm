import { test, expect } from '@playwright/test'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { freshStateDir, launchApp, closeApp } from '../_harness.js'

// CRF-19: an image pasted into the agent composer is written to a real file and
// its path is what the prompt hands to Claude. Drives the whole chain through the
// live IPC — the assertion is that the pasted bytes are on disk at the path the
// chip advertises. A fresh launch already shows the composer (no tab selected).

// A 1x1 PNG, the smallest thing that is unmistakably an image file.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

test('composer: a pasted image is written to disk and chipped under the prompt', async () => {
  const dir = freshStateDir('crafterm-e2e-paste-')
  const { app, win } = await launchApp(dir)
  let written: string | null = null
  try {
    const input = win.locator('.agent-composer-input')
    await expect(input).toBeVisible({ timeout: 15_000 })

    await input.evaluate((el, base64) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
      const file = new File([bytes], 'clip.png', { type: 'image/png' })
      const data = new DataTransfer()
      data.items.add(file)
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
    }, PNG_BASE64)

    const chip = win.locator('.composer-attachments-chip')
    await expect(chip).toHaveCount(1, { timeout: 10_000 })

    // The tooltip is "<name>\n<path>\nClick to remove"; the path is what the prompt
    // will carry, the name is what it will call the image.
    const [name, path] = (await chip.getAttribute('title'))!.split('\n')
    written = path
    expect(name).toBe('image-1')
    expect(written).toContain('crafterm-pasted-images')
    expect(written.endsWith('/image-1.png')).toBe(true)
    expect(existsSync(written)).toBe(true)
    expect(readFileSync(written).toString('base64')).toBe(PNG_BASE64)
    await expect(chip.locator('.composer-attachments-name')).toHaveText('image-1')

    await test.step('clicking the chip drops the attachment again', async () => {
      await chip.click()
      await expect(win.locator('.composer-attachments-chip')).toHaveCount(0)
    })
  } finally {
    if (written) rmSync(written, { force: true })
    await closeApp(app, dir)
  }
})
