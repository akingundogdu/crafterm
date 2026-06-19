import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// secrets.service end-to-end through the real Electron main process: the generic
// renderer bridge (window.crafterm.invoke over the secrets:* channels) → secrets:*
// IPC → safeStorage. Proves the extracted service round-trips and that on-disk
// blobs are never plaintext. HR-5: throwaway state dir, never the real ~/.crafterm.

declare global {
  interface Window {
    crafterm: {
      invoke(channel: string, payload?: unknown): Promise<unknown>
      send(channel: string, payload?: unknown): void
      on(channel: string, cb: (payload: unknown) => void): () => void
    }
  }
}

function freshDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'crafterm-e2e-secrets-'))
  if (/\.crafterm(-dev)?(\/|$)/.test(d)) throw new Error('HR-5 violated: refusing real state dir')
  return d
}

async function launch(dir: string): Promise<{ app: ElectronApplication; win: Page }> {
  const app = await electron.launch({ args: ['.'], env: { ...process.env, CRAFTERM_E2E: '1', CRAFTERM_STATE_DIR: dir } })
  const win = await app.firstWindow()
  await expect(win.locator('#app')).toBeVisible({ timeout: 30_000 })
  return { app, win }
}

const ENTRY = 'e2e-entry'
const KEY = 'password'
const VALUE = 'sup3r-s3cret-VALUE-token'

test('secrets: round-trip via the bridge, encrypted on disk, deletable', async () => {
  const dir = freshDir()
  let app: ElectronApplication | null = null
  try {
    const s = await launch(dir)
    app = s.app
    const win = s.win

    const available = await win.evaluate(() => window.crafterm.invoke('secrets:available'))
    test.skip(!available, 'safeStorage encryption unavailable on this host (headless CI)')

    await test.step('set + get round-trips the value', async () => {
      const setRes = await win.evaluate(
        (a) => window.crafterm.invoke('secrets:set', { entryId: a.entry, key: a.key, value: a.value }),
        { entry: ENTRY, key: KEY, value: VALUE }
      )
      expect(setRes).toEqual({ ok: true })

      const got = await win.evaluate(
        (a) => window.crafterm.invoke('secrets:get', { entryId: a.entry, key: a.key }),
        { entry: ENTRY, key: KEY }
      )
      expect(got).toBe(VALUE)
    })

    await test.step('the on-disk blob exists and is not plaintext', async () => {
      const blob = join(dir, 'secrets', ENTRY, KEY + '.bin')
      await expect.poll(() => existsSync(blob), { timeout: 5_000 }).toBe(true)
      const raw = readFileSync(blob)
      expect(raw.length).toBeGreaterThan(0)
      expect(raw.toString('utf8')).not.toContain(VALUE)
    })

    await test.step('delete removes the secret', async () => {
      const delRes = await win.evaluate(
        (a) => window.crafterm.invoke('secrets:delete', { entryId: a.entry, key: a.key }),
        { entry: ENTRY, key: KEY }
      )
      expect(delRes).toEqual({ ok: true })
      const after = await win.evaluate(
        (a) => window.crafterm.invoke('secrets:get', { entryId: a.entry, key: a.key }),
        { entry: ENTRY, key: KEY }
      )
      expect(after).toBeNull()
      expect(existsSync(join(dir, 'secrets', ENTRY, KEY + '.bin'))).toBe(false)
    })
  } finally {
    if (app) await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
