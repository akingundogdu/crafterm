import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Project sub-entities through the real Settings UI: applications (nested in
// ProjectNode.apps, via applicationRepo) and the per-project iOS config (via
// iosConfigRepo). Create a project in the sidebar, then add an app + enable iOS
// in Settings → Projects, asserting render + persist + relaunch restore.

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
  const app = await electron.launch({ args: ['.'], env: { ...process.env, CRAFTERM_STATE_DIR: dir } })
  const win = await app.firstWindow()
  await expect(win.locator('#app')).toBeVisible({ timeout: 30_000 })
  return { app, win }
}
async function waitForState(dir: string, pred: (st: Record<string, any>) => boolean): Promise<void> {
  await expect.poll(() => { const st = readState(dir); return !!st && pred(st) }, { timeout: 5_000 }).toBe(true)
}
function findProject(nodes: any[], name: string): any {
  return (nodes ?? []).reduce(
    (f: any, n: any) => f ?? (n.kind === 'project' && n.name === name ? n : findProject(n.children, name)),
    null
  )
}

const PROJECT = `E2E Proj ${Date.now()}`
const APP = `e2e-app-${Date.now()}`

test('settings/projects: add an application and enable iOS; restore on relaunch', async () => {
  const dir = freshDir()

  let app: ElectronApplication | null = null
  try {
    const s = await launch(dir)
    app = s.app
    const win = s.win

    await test.step('create a project (sidebar)', async () => {
      await win.locator('#new-project').click()
      const dlg = win.locator('.modal.prompt-modal')
      await expect(dlg).toBeVisible()
      const inputs = dlg.locator('input[type="text"]')
      await inputs.nth(0).fill(PROJECT) // name
      await inputs.nth(1).fill('/tmp/e2e-proj') // path (required)
      await dlg.getByRole('button', { name: 'Create' }).click()
      await expect(win.locator('#tab-list')).toContainText(PROJECT)
    })

    await win.locator('#settings-btn').click()
    await expect(win.locator('.modal.settings-modal')).toBeVisible()
    await win.locator('.settings-nav .settings-nav-item', { hasText: 'Projects' }).click()
    const panel = win.locator('.settings-panel:visible')

    await test.step('add an application to the project (Apps sub-tab)', async () => {
      await panel.locator('.settings-subtab', { hasText: 'Apps' }).click()
      await panel.getByRole('button', { name: '+ Add application' }).click()
      // the new app card has a Name field prefilled "app"; rename it to assert uniquely
      const nameInput = panel.locator('.app-card input[type="text"]').first()
      await nameInput.fill(APP)
      await nameInput.blur()
      await waitForState(dir, (st) => (findProject(st.tree, PROJECT)?.apps ?? []).some((a: any) => a.name === APP))
    })

    await test.step('enable iOS on the project (iOS sub-tab)', async () => {
      await panel.locator('.settings-subtab', { hasText: 'iOS' }).click()
      await panel.locator('label', { hasText: 'iOS app' }).locator('input[type="checkbox"]').check()
      await waitForState(dir, (st) => {
        const p = findProject(st.tree, PROJECT)
        return !!p?.iosConfig && p?.supportWorktree === true
      })
    })
  } finally {
    if (app) await app.close()
  }

  let app2: ElectronApplication | null = null
  try {
    const s2 = await launch(dir)
    app2 = s2.app
    const st = readState(dir)!
    const proj = findProject(st.tree, PROJECT)
    expect(proj?.apps?.some((a: any) => a.name === APP), 'application restored').toBe(true)
    expect(!!proj?.iosConfig, 'iosConfig restored').toBe(true)
    await expect(s2.win.locator('#tab-list')).toContainText(PROJECT)
  } finally {
    if (app2) await app2.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
