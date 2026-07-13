import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { freshStateDir, launchApp, closeApp } from '../_harness.js'

// Improve / Todo screen (§8): loads the todo JSON into 3 tabs + persists a new
// feature request. The todo file is the top-level `todoFile` setting — pointed at
// a file inside the throwaway state dir, so the real ~/.crafterm is never touched.

const TODO_SEED = {
  version: 1,
  preamble: '# crafterm — Todo List',
  sectionsOrder: ['In progress', 'Ready to test', 'Backlog', 'Done'],
  items: [
    { id: 'todo-a', text: 'e2e backlog item', status: 'Backlog', priority: 0, createdAt: 1, updatedAt: 1 },
    { id: 'todo-b', text: 'e2e ready item', status: 'Ready to test', priority: 0, createdAt: 1, updatedAt: 1 },
    { id: 'todo-c', text: 'e2e done item', status: 'Done', priority: 0, createdAt: 1, updatedAt: 1 }
  ]
}

// Cmd+Shift+L is a TOGGLE and can miss the first keypress before focus settles.
// Press only when the modal isn't already open, so a slow-to-open modal (under
// full-suite load) isn't toggled shut by a retry press — which previously left it
// open-but-unloaded and the items never rendered.
async function openImprove(win: Page): Promise<void> {
  await expect(async () => {
    if (!(await win.locator('.modal.improve-modal').isVisible())) {
      await win.keyboard.press('Meta+Shift+l')
    }
    await expect(win.locator('.modal.improve-modal')).toBeVisible({ timeout: 2500 })
  }).toPass({ timeout: 15_000 })
}

test('improve: loads the todo JSON into 3 tabs + a feature request persists', async () => {
  const dir = freshStateDir('crafterm-e2e-imp-')
  const todoPath = join(dir, 'todo-list.json')
  writeFileSync(todoPath, JSON.stringify(TODO_SEED))
  writeFileSync(join(dir, 'crafterm-state.json'), JSON.stringify({ schemaVersion: 4, tree: [], todoFile: todoPath }))
  const { app, win } = await launchApp(dir)
  try {
    await openImprove(win)
    const modal = win.locator('.modal.improve-modal')
    await expect(modal.locator('.improve-item').first()).toBeVisible({ timeout: 10_000 }) // async read finished

    await test.step('3 tabs; Todo active shows the backlog item', async () => {
      await expect(modal.locator('.improve-tabs .improve-tab')).toHaveCount(3)
      await expect(modal.locator('.improve-tab.active')).toHaveText(/Todo/)
      await expect(modal.locator('.improve-list')).toContainText('e2e backlog item')
    })

    await test.step('Ready / Done tabs show their items', async () => {
      await modal.locator('.improve-tab', { hasText: 'Ready to test' }).click()
      await expect(modal.locator('.improve-list')).toContainText('e2e ready item')
      await modal.locator('.improve-tab', { hasText: 'Done' }).click()
      await expect(modal.locator('.improve-item.done')).toContainText('e2e done item')
    })

    await test.step('request a feature → persists to the todo JSON (Backlog)', async () => {
      await modal.getByRole('button', { name: '+ Request new feature' }).click()
      await modal.locator('.improve-textarea').fill('e2e new feature request')
      await modal.getByRole('button', { name: 'Save', exact: true }).click()
      await expect
        .poll(
          () => {
            try {
              return (JSON.parse(readFileSync(todoPath, 'utf8')).items as any[]).some(
                (i) => i.text === 'e2e new feature request' && /backlog/i.test(i.status)
              )
            } catch {
              return false
            }
          },
          { timeout: 5_000 }
        )
        .toBe(true)
    })
  } finally {
    await closeApp(app, dir)
  }
})
