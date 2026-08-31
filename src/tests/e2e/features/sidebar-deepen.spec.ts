import { test, expect } from '@playwright/test'
import { homedir } from 'node:os'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { freshStateDir, launchApp, closeApp } from '../_harness.js'

// Sidebar §3 deepen: the issue-key suffix on a tab label, the Claude status pill's
// review/test task override, group-header bucketing, and tab-strip display (mode/
// hide/reorder). All pure-state seeds — no JSONL/git needed. HR-5: throwaway dir.

const TODAY = (() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})()

function writeState(dir: string, state: Record<string, any>): void {
  writeFileSync(join(dir, 'crafterm-state.json'), JSON.stringify({ schemaVersion: 4, ...state }))
}
function task(over: Record<string, any>): Record<string, any> {
  return { id: 'x', title: 'T', date: TODAY, status: 'wip', priority: 'medium', tagIds: [], order: 0, createdAt: 0, updatedAt: 0, ...over }
}
function boundTermTab(title: string, taskId: string): Record<string, any> {
  return {
    kind: 'tab', title, titleLocked: true, color: null, pinned: false, status: 'idle',
    root: { type: 'leaf', stableId: 'aaaaaaaa-bbbb-4ccc-8ddd-000000000041', cwd: homedir(), tickets: [taskId] }
  }
}
function project(id: string, name: string, group?: string): Record<string, any> {
  return { kind: 'project', id, name, color: null, collapsed: false, pinned: false, children: [], path: homedir(), ...(group ? { group } : {}) }
}

test('sidebar: a tab assigned to a task shows the issue key as a badge, not in the label', async () => {
  const dir = freshStateDir('crafterm-e2e-sbd-')
  writeState(dir, {
    tree: [boundTermTab('My Session', 't-1')],
    dailyPlan: { tags: [], tasks: [task({ id: 't-1', issueKey: 'CRF-12', projectId: 'p' })] }
  })
  const { app, win } = await launchApp(dir)
  try {
    const item = win.locator('#tab-list .tab-item', { hasText: 'My Session' })
    await expect(item.locator('.tab-title', { hasText: 'My Session' })).toBeVisible({ timeout: 12_000 })
    await expect(item.locator('.tab-title')).toHaveText('My Session')
    await expect(item.locator('.tab-ticket-badge', { hasText: 'CRF-12' })).toBeVisible()
  } finally {
    await closeApp(app, dir)
  }
})

test('sidebar: a task in review shows the review pill (overrides the Claude status)', async () => {
  const dir = freshStateDir('crafterm-e2e-sbd-')
  writeState(dir, {
    tree: [boundTermTab('Review Session', 't-2')],
    dailyPlan: { tags: [], tasks: [task({ id: 't-2', issueKey: 'CRF-13', projectId: 'p', status: 'review' })] }
  })
  const { app, win } = await launchApp(dir)
  try {
    await expect(win.locator('#tab-list .tab-item .claude-status.claude-review', { hasText: 'review' })).toBeVisible({ timeout: 12_000 })
  } finally {
    await closeApp(app, dir)
  }
})

test('sidebar: a grouped container buckets under a group header', async () => {
  const dir = freshStateDir('crafterm-e2e-sbd-')
  writeState(dir, { tree: [project('p-a', 'Alpha', 'Work'), project('p-b', 'Beta')] })
  const { app, win } = await launchApp(dir)
  try {
    await expect(win.locator('#tab-list .section-label.group-header', { hasText: 'Work' })).toBeVisible({ timeout: 12_000 })
    await expect(win.locator('#tab-list .section-label.group-header', { hasText: 'Ungrouped' })).toBeVisible()
    await expect(win.locator('#tab-list .tab-item', { hasText: 'Alpha' })).toBeVisible()
  } finally {
    await closeApp(app, dir)
  }
})

test('sidebar: tab-strip display mode + hide + reorder apply from settings', async () => {
  const dir = freshStateDir('crafterm-e2e-sbd-')
  writeState(dir, {
    tree: [],
    tabDisplay: { mode: 'text', hidden: { left: ['tab-docker'], right: [] }, order: { left: ['tab-notebook', 'tab-terminal'], right: [] } }
  })
  const { app, win } = await launchApp(dir)
  try {
    await expect(win.locator('#sidebar-tabs')).toHaveClass(/tabs-mode-text/, { timeout: 12_000 })
    await expect(win.locator('#tab-docker')).toBeHidden() // hidden[left]
    await expect(win.locator('#tab-terminal')).toBeVisible()
    await expect(win.locator('#tab-terminal .tab-label')).toHaveText('Terminal') // icon/label wrap applied
    const ids = await win.locator('#sidebar-tabs > button').evaluateAll((els) => els.map((e) => e.id))
    expect(ids.slice(0, 2)).toEqual(['tab-notebook', 'tab-terminal']) // order honored
  } finally {
    await closeApp(app, dir)
  }
})
