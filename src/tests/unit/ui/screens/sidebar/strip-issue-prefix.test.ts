import { describe, it, expect, vi } from 'vitest'

vi.mock('@views/screens/content/content.store', () => ({ setSideBySide: () => {}, exitSideBySide: () => {} }))
vi.mock('@views/state/spine', () => ({
  state: { tree: [] },
  panes: new Map(),
  settings: {},
  paneActions: {},
  renderContent: () => {},
  requestSidebar: () => {}
}))
vi.mock('@services/bgproc', () => ({ openProcessView: () => {}, killProcess: () => {} }))
vi.mock('@views/tree/tree', () => ({
  allTabs: () => [],
  panesInLayout: () => [],
  firstPaneOf: () => null,
  ancestorFolders: () => []
}))
vi.mock('@views/pane/pane', () => ({ paneStatus: () => 'idle', isPlanOwnedByPane: () => false }))
vi.mock('@views/commands/commands', () => ({
  selectPane: () => {},
  openMarkdownFile: () => {},
  toggleTabDetails: () => {},
  openTerminalRunning: () => {},
  contextFolderId: () => null,
  runInSplit: () => {}
}))
vi.mock('@views/screens/pickers/project/project', () => ({ showProjectPicker: () => {} }))
vi.mock('@views/screens/pickers/update/update', () => ({ runUpdate: () => {} }))
vi.mock('@views/screens/pickers/command/command', () => ({ showCommandPalette: () => {}, showCommandHistory: () => {} }))
vi.mock('@views/screens/pickers/ssh/ssh', () => ({ showSshConnections: () => {} }))
vi.mock('@views/screens/pickers/claude/claude', () => ({
  showClaudeDashboard: () => {},
  showClaudeAccountSwitcher: () => {},
  showClaudeSessionResume: () => {}
}))

const { stripIssuePrefix } = await import('@views/screens/sidebar/sidebar.store')

describe('stripIssuePrefix', () => {
  it('strips a redundant leading issue key and its separator', () => {
    expect(stripIssuePrefix('MSP-BE-31-device-token-user-id', 'MSP-BE-31')).toBe('device-token-user-id')
  })

  it('is case-insensitive on the key match', () => {
    expect(stripIssuePrefix('crf-12-fix-login', 'CRF-12')).toBe('fix-login')
  })

  it('leaves the title untouched when it does not start with the key', () => {
    expect(stripIssuePrefix('My Session', 'CRF-12')).toBe('My Session')
  })

  it('falls back to the original title when stripping would leave it empty', () => {
    expect(stripIssuePrefix('MSP-BE-31', 'MSP-BE-31')).toBe('MSP-BE-31')
  })
})
