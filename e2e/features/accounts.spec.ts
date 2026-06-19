import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Accounts feature through the real UI: the form writes via accountRepo ->
// persistence; the sidebar list reads via accountRepo.getAll(). Add an account
// and a secret, delete one (with confirm), and confirm restore on relaunch.

function freshDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'crafterm-e2e-'))
  if (/\.crafterm(-dev)?(\/|$)/.test(d)) throw new Error('HR-5 violated: refusing real state dir')
  return d
}
function readState(dir: string): Record<string, any> | null {
  try {
    return JSON.parse(readFileSync(join(dir, 'crafterm-state.json'), 'utf8'))
  } catch {
    return null
  }
}
async function launch(dir: string): Promise<{ app: ElectronApplication; win: Page }> {
  const app = await electron.launch({ args: ['.'], env: { ...process.env, CRAFTERM_E2E: '1', CRAFTERM_STATE_DIR: dir } })
  const win = await app.firstWindow()
  await expect(win.locator('#app')).toBeVisible({ timeout: 30_000 })
  return { app, win }
}
async function waitForState(dir: string, pred: (st: Record<string, any>) => boolean): Promise<void> {
  await expect.poll(() => { const st = readState(dir); return !!st && pred(st) }, { timeout: 5_000 }).toBe(true)
}

const A1 = `E2E Account Keep ${Date.now()}`
const A2 = `E2E Account Drop ${Date.now()}`

async function addEntry(win: Page, newBtnId: string, label: string): Promise<void> {
  await win.locator(`#${newBtnId}`).click()
  const modal = win.locator('.modal-overlay')
  await expect(modal).toBeVisible()
  await modal.locator('input[type="text"]').first().fill(label) // first field is "Label"
  await modal.getByRole('button', { name: 'Add', exact: true }).click() // primary submit, not "+ Add field"
  await expect(modal).toBeHidden()
}

test('accounts: add account + secret, delete, and restore on relaunch', async () => {
  const dir = freshDir()

  let app: ElectronApplication | null = null
  try {
    const s = await launch(dir)
    app = s.app
    const win = s.win
    await win.locator('#tab-accounts').click() // Accounts sidebar mode

    await test.step('add an account and a secret -> render + persist', async () => {
      await addEntry(win, 'accounts-new-entry', A1)
      await addEntry(win, 'accounts-new-secret', A2)
      const list = win.locator('#tab-list')
      await expect(list).toContainText(A1)
      await expect(list).toContainText(A2)
      await waitForState(dir, (st) => (st.accounts ?? []).filter((a: any) => a.label === A1 || a.label === A2).length === 2)
    })

    await test.step('delete the secret entry -> gone from list + disk', async () => {
      const card = win.locator('#tab-list .accounts-card', { hasText: A2 })
      await card.getByRole('button', { name: 'Delete' }).click()
      const confirm = win.locator('.modal-overlay') // promptConfirm dialog
      await confirm.getByRole('button', { name: 'Delete' }).click()
      await expect(win.locator('#tab-list')).not.toContainText(A2)
      await expect(win.locator('#tab-list')).toContainText(A1)
      await waitForState(dir, (st) => !(st.accounts ?? []).some((a: any) => a.label === A2))
    })
  } finally {
    if (app) await app.close()
  }

  let app2: ElectronApplication | null = null
  try {
    const s2 = await launch(dir)
    app2 = s2.app
    await s2.win.locator('#tab-accounts').click()
    await expect(s2.win.locator('#tab-list')).toContainText(A1)
    await expect(s2.win.locator('#tab-list')).not.toContainText(A2)
  } finally {
    if (app2) await app2.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
