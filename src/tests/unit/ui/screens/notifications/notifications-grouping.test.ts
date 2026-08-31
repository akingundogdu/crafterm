import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { AppNotification } from '@views/types/types'

let stored: AppNotification[] = []

// The live world the panel resolves against: which panes exist (keyed by their
// runtime id, carrying the stable id that survives a restart) and which terminal
// each pane sits in.
const panes = new Map<string, { stableId: string }>()
const tabsByPane = new Map<string, { id: string; title: string }>()

vi.mock('@views/state/spine', () => ({
  get panes() {
    return panes
  },
  poppedOut: new Map(),
  state: { tree: [] },
  settings: { claudeUsageAuth: {}, claudeUsageNotify: { session: {}, week: {} } },
  pushNotification: () => {}
}))
vi.mock('@views/tree/tree', () => ({
  findTabByPane: (_tree: unknown, paneId: string) => tabsByPane.get(paneId) ?? null
}))
vi.mock('@repositories/persistence.service', () => ({ persistence: { save: () => {} } }))
// Panes a click landed on, so goToGroup's navigation is observable.
const selectedPanes = vi.hoisted(() => [] as string[])
vi.mock('@views/commands/commands', () => ({
  selectPane: (paneId: string) => {
    selectedPanes.push(paneId)
  },
  openLink: () => {},
  openNote: () => {},
  openMarkdownFile: () => {}
}))
vi.mock('@services', () => ({ terminalService: {}, claudeService: {}, secretsService: {} }))
vi.mock('@services/domain/usage', () => ({ fmtResetTime: () => '' }))
vi.mock('@repositories', () => ({
  bookmarkRepo: { get: () => null },
  dailyTaskRepo: { get: () => null },
  meetingNoteRepo: { get: () => null },
  notificationRepo: {
    getAll: () => stored,
    remove: (id: string) => {
      stored = stored.filter((n) => n.id !== id)
    },
    clear: () => {
      stored = []
    }
  }
}))
vi.mock('@views/components/status-bar/components/notif-badge', () => ({ updateNotifBadge: () => {} }))
vi.mock('@views/screens/daily-plan/daily-plan.entry', () => ({ showDailyPlanModal: () => {} }))
vi.mock('@views/screens/meeting-notes/meeting-notes.store', () => ({ openMeetingNote: () => {} }))

const { default: store, groupNotifications } = await import('@views/screens/notifications/notifications.store')
const { goToGroup } = await import('@views/screens/notifications/components/notification-group.store')

function notif(
  id: string,
  paneId: string,
  group: string,
  time: number,
  extra: Partial<AppNotification> = {}
): AppNotification {
  return {
    id,
    paneId,
    group,
    title: paneId ? `snapshot of ${paneId}` : 'Crafterm',
    message: `message ${id}`,
    time,
    ...extra
  } as AppNotification
}

// Put a pane on screen, inside a terminal.
function livePane(paneId: string, stableId: string, tabId: string, tabTitle: string): void {
  panes.set(paneId, { stableId })
  tabsByPane.set(paneId, { id: tabId, title: tabTitle })
}

beforeEach(() => {
  panes.clear()
  tabsByPane.clear()
})

describe('groupNotifications', () => {
  it('collapses one terminal’s notifications into a single group', () => {
    livePane('p1', 's1', 't1', 'backend')
    livePane('p2', 's2', 't2', 'ios')

    const groups = groupNotifications([
      notif('a', 'p1', 'alpha', 30),
      notif('b', 'p1', 'alpha', 20),
      notif('c', 'p2', 'beta', 10)
    ])

    expect(groups.map((g) => g.key)).toEqual(['tab:t1', 'tab:t2'])
    expect(groups[0].items.map((n) => n.id)).toEqual(['a', 'b'])
    expect(groups[0].latest).toBe(30)
    expect(groups[1].items).toHaveLength(1)
  })

  it("groups a split terminal's panes together — they are one terminal", () => {
    // Two panes, same tab: this used to produce two groups (todomr5sckyaei).
    livePane('p1', 's1', 't1', 'backend')
    livePane('p2', 's2', 't1', 'backend')

    const groups = groupNotifications([notif('a', 'p1', 'alpha', 20), notif('b', 'p2', 'alpha', 10)])

    expect(groups).toHaveLength(1)
    expect(groups[0].key).toBe('tab:t1')
    expect(groups[0].items.map((n) => n.id)).toEqual(['a', 'b'])
  })

  it('names a group by the sidebar’s CURRENT title, not the stored snapshot', () => {
    livePane('p1', 's1', 't1', 'renamed after the fact')

    const groups = groupNotifications([notif('a', 'p1', 'alpha', 10)])

    expect(groups[0].title).toBe('renamed after the fact')
    expect(groups[0].paneId).toBe('p1')
  })

  it('finds the terminal again after a restart, when the pane id changed', () => {
    // Restore re-creates the pane with a FRESH runtime id; only the stable id holds.
    livePane('p-new', 's1', 't1', 'backend')
    const restored = notif('a', 'p-old', 'alpha', 10, { paneStableId: 's1' })

    const groups = groupNotifications([restored])

    expect(groups[0].key).toBe('tab:t1')
    expect(groups[0].title).toBe('backend')
    expect(groups[0].paneId).toBe('p-new') // clicking it lands on the live pane
  })

  it('keeps a gone terminal on its own, labelled by the snapshot and not clickable', () => {
    const orphan = notif('a', 'p-dead', 'alpha', 10, { paneStableId: 's-dead' })

    const groups = groupNotifications([orphan])

    expect(groups[0].key).toBe('a')
    expect(groups[0].title).toBe('snapshot of p-dead')
    expect(groups[0].paneId).toBeNull()
  })

  it('keeps pane-less notifications (Claude usage, app alerts) on their own', () => {
    const groups = groupNotifications([notif('u1', '', '', 10), notif('u2', '', '', 5)])

    expect(groups.map((g) => g.key)).toEqual(['u1', 'u2'])
    expect(groups.every((g) => g.items.length === 1)).toBe(true)
  })

  it('orders groups by their newest notification', () => {
    livePane('p1', 's1', 't1', 'backend')
    livePane('p2', 's2', 't2', 'ios')

    const groups = groupNotifications([
      notif('old', 'p1', 'alpha', 10),
      notif('new', 'p2', 'beta', 99),
      notif('mid', 'p1', 'alpha', 50)
    ])

    expect(groups.map((g) => g.key)).toEqual(['tab:t2', 'tab:t1'])
    expect(groups[1].latest).toBe(50)
  })
})

describe('NotificationsStore', () => {
  beforeEach(() => {
    livePane('p1', 's1', 't1', 'backend')
    livePane('p2', 's2', 't2', 'ios')
    livePane('p3', 's3', 't3', 'admin')
    stored = [
      notif('a', 'p1', 'alpha', 40, { event: 'question' }),
      notif('b', 'p1', 'alpha', 30, { event: 'done' }),
      notif('c', 'p2', 'beta', 20, { event: 'done' }),
      notif('d', 'p3', 'beta', 10, { kind: 'reminder' })
    ]
    selectedPanes.length = 0
    store.reload()
  })

  it('groups every notification — the panel has no filters', () => {
    expect(store.groups.map((g) => g.key)).toEqual(['tab:t1', 'tab:t2', 'tab:t3'])
    expect(store.groups.flatMap((g) => g.items.map((n) => n.id))).toEqual(['a', 'b', 'c', 'd'])
  })

  it('dismisses a whole group at once', () => {
    const group = store.groups[0]
    store.dismissGroup(group)

    expect(stored.map((n) => n.id)).toEqual(['c', 'd'])
    expect(store.groups.map((g) => g.key)).toEqual(['tab:t2', 'tab:t3'])
  })
})

describe('goToGroup', () => {
  beforeEach(() => {
    livePane('p1', 's1', 't1', 'backend')
    livePane('p2', 's2', 't2', 'ios')
    stored = [notif('a', 'p1', 'alpha', 40), notif('b', 'p1', 'alpha', 30), notif('c', 'p2', 'beta', 20)]
    selectedPanes.length = 0
    store.reload()
  })

  it('opens the terminal and clears the group, like a single card', () => {
    goToGroup(store.groups[0])

    expect(selectedPanes).toEqual(['p1'])
    expect(stored.map((n) => n.id)).toEqual(['c'])
    expect(store.groups.map((g) => g.key)).toEqual(['tab:t2'])
  })

  it('keeps a gone terminal’s notifications — there is nowhere to go', () => {
    stored = [notif('x', 'p-dead', 'alpha', 10, { paneStableId: 's-dead' })]
    store.reload()

    goToGroup(store.groups[0])

    expect(selectedPanes).toEqual([])
    expect(stored.map((n) => n.id)).toEqual(['x'])
  })
})
