import { test, expect } from '@playwright/test'
import { launchDemo, closeDemo, assertNoPrivateData } from '../lib/harness.js'
import { Recorder } from '../lib/recorder.js'

// README §"Claude Code integration" — Crafterm indexes the Claude Code sessions on
// disk: resume one from the picker, or find it in Spotlight. The session transcripts
// come from a fake CRAFTERM_CLAUDE_DIR (scripts/screenshots/lib/demo-repo.ts).
test('claude sessions', async () => {
  const { app, win } = await launchDemo()
  try {
    const rec = new Recorder(win, 'claude')
    await rec.hold(700)

    await win.locator('#sidebar-actions').click()
    await rec.hold(600)
    // "Resume Claude session" lists the transcripts on disk (the live-pane dashboard
    // next to it would be empty here — no Claude is actually running).
    await win.locator('.context-menu button', { hasText: /Resume Claude session/i }).click()
    const picker = win.locator('.picker-modal')
    await expect(picker).toBeVisible({ timeout: 10_000 })
    await expect(picker.locator('.pick-row').first()).toBeVisible({ timeout: 10_000 })
    await rec.hold(2400)

    // Filtering the transcripts by their summary text.
    await picker.locator('input.search-box-input').click()
    await rec.typeText('promo')
    await rec.hold(2000)

    await assertNoPrivateData(win)
    rec.encode()
  } finally {
    await closeDemo(app)
  }
})
