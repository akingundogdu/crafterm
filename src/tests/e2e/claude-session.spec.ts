import { test, expect } from '@playwright/test'
import { homedir } from 'node:os'
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { freshStateDir, launchApp, openTerminal, selectTab, readState, closeApp } from './_harness.js'

// Claude-session binding lifecycle (§2), Layer A only — Crafterm's handoff, NOT
// the model's context continuity. We drive it WITHOUT the real claude CLI by
// pointing CRAFTERM_CLAUDE_DIR at a throwaway dir and seeding JSONL fixtures
// (Claude's own record shapes). HR-5: throwaway state dir only; the real
// ~/.claude is never touched.

function rootLeaf(dir: string): any {
  const tab = (readState(dir)?.tree ?? []).find((n: any) => n.kind === 'tab')
  return tab?.root?.type === 'leaf' ? tab.root : null
}
// Claude encodes a cwd into its project-dir name by replacing "/" and "." with "-".
function encodeCwd(cwd: string): string {
  return cwd.replace(/[/.]/g, '-')
}
function fixturePath(claudeDir: string, cwd: string, sessionId: string): string {
  return join(claudeDir, encodeCwd(cwd), sessionId + '.jsonl')
}
function writeFixture(claudeDir: string, cwd: string, sessionId: string, lines: object[]): void {
  mkdirSync(join(claudeDir, encodeCwd(cwd)), { recursive: true })
  writeFileSync(fixturePath(claudeDir, cwd, sessionId), lines.map((l) => JSON.stringify(l)).join('\n') + '\n')
}
function appendFixture(claudeDir: string, cwd: string, sessionId: string, lines: object[]): void {
  appendFileSync(fixturePath(claudeDir, cwd, sessionId), lines.map((l) => JSON.stringify(l)).join('\n') + '\n')
}
// Seed a persisted tab whose pane is already a bound Claude session at `cwd`.
function seedClaudeSession(stateDir: string, cwd: string, sessionId: string): void {
  const seed = {
    schemaVersion: 4,
    tree: [
      {
        kind: 'tab',
        title: 'Claude',
        titleLocked: false,
        color: null,
        pinned: false,
        status: 'idle',
        root: {
          type: 'leaf',
          stableId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
          cwd,
          claude: true,
          claudeSessionId: sessionId
        }
      }
    ]
  }
  writeFileSync(join(stateDir, 'crafterm-state.json'), JSON.stringify(seed))
}

test('claude: typing `claude` flips detection and the session id binds + persists', async () => {
  const dir = freshStateDir('crafterm-e2e-cl-')
  const claudeDir = join(dir, 'claude')
  const U = 'aaaaaaaa-bbbb-4ccc-8ddd-000000000001'
  const { app, win } = await launchApp(dir, { CRAFTERM_CLAUDE_DIR: claudeDir })
  try {
    await openTerminal(win)
    await win.locator('.pane-term').first().click()
    await win.keyboard.type('claude')
    await win.keyboard.press('Enter')

    await test.step('detection: the leaf is marked claude', async () => {
      await expect.poll(() => rootLeaf(dir)?.claude === true, { timeout: 8_000 }).toBe(true)
    })

    await test.step('the session id locks from the newest JSONL', async () => {
      await expect.poll(() => !!rootLeaf(dir)?.cwd, { timeout: 12_000 }).toBe(true)
      writeFixture(claudeDir, rootLeaf(dir).cwd, U, [{ type: 'user', message: { role: 'user', content: 'hi' } }])
      await expect.poll(() => rootLeaf(dir)?.claudeSessionId === U, { timeout: 15_000 }).toBe(true)
    })
  } finally {
    await closeApp(app, dir)
  }
})

test('claude: a restored session injects `claude --resume <id>` on launch', async () => {
  const dir = freshStateDir('crafterm-e2e-cl-')
  const claudeDir = join(dir, 'claude')
  const U = 'aaaaaaaa-bbbb-4ccc-8ddd-000000000002'
  seedClaudeSession(dir, homedir(), U)
  const { app, win } = await launchApp(dir, { CRAFTERM_CLAUDE_DIR: claudeDir })
  try {
    await selectTab(win) // the seeded tab restores unselected; activate it
    // buildLayout injects `claude --resume <id>\r` 500ms after restore; the shell
    // echoes the injected command into the rendered xterm.
    await expect(win.locator('.pane-term .xterm-rows')).toContainText(`claude --resume ${U}`, { timeout: 12_000 })
  } finally {
    await closeApp(app, dir)
  }
})

test('claude: /rename custom-title syncs to the pane header + sidebar label', async () => {
  const dir = freshStateDir('crafterm-e2e-cl-')
  const claudeDir = join(dir, 'claude')
  const U = 'aaaaaaaa-bbbb-4ccc-8ddd-000000000003'
  const cwd = homedir()
  seedClaudeSession(dir, cwd, U)
  writeFixture(claudeDir, cwd, U, [
    { type: 'user', message: { role: 'user', content: 'hi' } },
    { type: 'custom-title', customTitle: 'Renamed One' }
  ])
  const { app, win } = await launchApp(dir, { CRAFTERM_CLAUDE_DIR: claudeDir })
  try {
    await selectTab(win) // the seeded tab restores unselected; activate it
    await test.step('initial custom-title reflects in both places', async () => {
      await expect(win.locator('.pane-box .pane-title', { hasText: 'Renamed One' })).toBeVisible({ timeout: 12_000 })
      await expect(win.locator('#tab-list .tab-item .tab-title', { hasText: 'Renamed One' })).toBeVisible({ timeout: 12_000 })
    })
    await test.step('a new /rename updates both live (fs watcher)', async () => {
      appendFixture(claudeDir, cwd, U, [{ type: 'custom-title', customTitle: 'Renamed Two' }])
      await expect(win.locator('.pane-box .pane-title', { hasText: 'Renamed Two' })).toBeVisible({ timeout: 12_000 })
      await expect(win.locator('#tab-list .tab-item .tab-title', { hasText: 'Renamed Two' })).toBeVisible({ timeout: 12_000 })
    })
  } finally {
    await closeApp(app, dir)
  }
})

test('claude: the sidebar status pill reflects the session JSONL state', async () => {
  const dir = freshStateDir('crafterm-e2e-cl-')
  const claudeDir = join(dir, 'claude')
  const U = 'aaaaaaaa-bbbb-4ccc-8ddd-000000000004'
  const cwd = homedir()
  seedClaudeSession(dir, cwd, U)
  writeFixture(claudeDir, cwd, U, [
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Done.' }] } }
  ])
  const { app, win } = await launchApp(dir, { CRAFTERM_CLAUDE_DIR: claudeDir })
  try {
    await expect(win.locator('#tab-list .tab-item .claude-status.claude-idle')).toBeVisible({ timeout: 12_000 })
    await test.step('flips to "question" when the assistant ends on a ?', async () => {
      writeFixture(claudeDir, cwd, U, [
        { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Which one?' }] } }
      ])
      await expect(win.locator('#tab-list .tab-item .claude-status.claude-question')).toBeVisible({ timeout: 12_000 })
    })
  } finally {
    await closeApp(app, dir)
  }
})
