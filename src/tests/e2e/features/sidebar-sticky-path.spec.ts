import { test, expect } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { freshStateDir, launchApp, closeApp } from '../_harness.js'

// The sticky ancestor path bar over the sidebar list: scrolling deep into a branch
// must keep naming the containers the topmost visible row lives in
// ("Musicpal › backend › worktrees"), and it must stay out of the way at the top of
// the list. Seeded as folders only, so no terminal spawns.

const LEAVES = 60

function seedDeepTree(dir: string): void {
  const leaves = Array.from({ length: LEAVES }, (_, i) => ({
    kind: 'folder',
    name: `leaf-${String(i).padStart(2, '0')}`,
    color: null,
    collapsed: false,
    pinned: false,
    children: []
  }))
  writeFileSync(
    join(dir, 'crafterm-state.json'),
    JSON.stringify({
      sidebar: { size: 230, orientation: 'left' },
      tree: [
        {
          kind: 'folder',
          name: 'Musicpal',
          color: null,
          collapsed: false,
          pinned: false,
          children: [
            {
              kind: 'project',
              name: 'backend',
              path: '/tmp/e2e-sticky-backend',
              color: null,
              collapsed: false,
              pinned: false,
              children: [
                {
                  kind: 'folder',
                  name: 'worktrees',
                  color: null,
                  collapsed: false,
                  pinned: false,
                  children: leaves
                }
              ]
            }
          ]
        }
      ]
    })
  )
}

test('sidebar sticky path: names the scrolled-into branch, hidden at the top', async () => {
  const dir = freshStateDir('crafterm-e2e-sticky-path-')
  seedDeepTree(dir)
  const { app, win } = await launchApp(dir)
  const bar = win.locator('.sticky-path')
  const list = win.locator('#tab-list')
  try {
    await test.step('at the top of the list there is no ancestor to name', async () => {
      await expect(list).toContainText('Musicpal')
      await expect(bar).toBeHidden()
    })

    await test.step('scrolled deep into the worktrees folder it names the whole chain', async () => {
      await list.evaluate((el) => {
        el.scrollTop = el.scrollHeight
      })
      await expect(bar).toBeVisible()
      await expect(bar).toContainText('Musicpal')
      await expect(bar).toContainText('backend')
      await expect(bar).toContainText('worktrees')
    })

    await test.step('scrolling back to the top hides it again', async () => {
      await list.evaluate((el) => {
        el.scrollTop = 0
      })
      await expect(bar).toBeHidden()
    })
  } finally {
    await closeApp(app, dir)
  }
})
