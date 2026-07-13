import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { AppNotification } from '@views/types/types'

let stored: AppNotification[] = []

vi.mock('@views/state/spine', () => ({
  panes: new Map(),
  poppedOut: new Map(),
  settings: { claudeUsageAuth: {}, claudeUsageNotify: { session: {}, week: {} } },
  pushNotification: () => {}
}))
vi.mock('@repositories/persistence.service', () => ({ persistence: { save: () => {} } }))
vi.mock('@views/commands/commands', () => ({
  selectPane: () => {},
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

const { default: store, groupNotifications, kindOf } = await import(
  '@views/screens/notifications/notifications.store'
)

function notif(id: string, paneId: string, group: string, time: number, extra: Partial<AppNotification> = {}) {
  return {
    id,
    paneId,
    group,
    title: paneId ? `terminal ${paneId}` : 'Crafterm',
    message: `message ${id}`,
    time,
    ...extra
  } as AppNotification
}

describe('groupNotifications', () => {
  it('collapses notifications from the same terminal into one group', () => {
    const groups = groupNotifications([
      notif('a', 't1', 'alpha', 30),
      notif('b', 't1', 'alpha', 20),
      notif('c', 't2', 'beta', 10)
    ])

    expect(groups.map((g) => g.key)).toEqual(['pane:t1', 'pane:t2'])
    expect(groups[0].items.map((n) => n.id)).toEqual(['a', 'b'])
    expect(groups[0].latest).toBe(30)
    expect(groups[1].items).toHaveLength(1)
  })

  it('keeps pane-less notifications (Claude usage, app alerts) on their own', () => {
    const groups = groupNotifications([notif('u1', '', '', 10), notif('u2', '', '', 5)])

    expect(groups.map((g) => g.key)).toEqual(['u1', 'u2'])
    expect(groups.every((g) => g.items.length === 1)).toBe(true)
  })

  it('orders groups by their newest notification', () => {
    const groups = groupNotifications([
      notif('old', 't1', 'alpha', 10),
      notif('new', 't2', 'beta', 99),
      notif('mid', 't1', 'alpha', 50)
    ])

    expect(groups.map((g) => g.key)).toEqual(['pane:t2', 'pane:t1'])
    expect(groups[1].latest).toBe(50)
  })
})

describe('kindOf', () => {
  it('reads the notification status', () => {
    expect(kindOf(notif('a', 't1', 'x', 1, { kind: 'reminder' }))).toBe('reminder')
    expect(kindOf(notif('b', 't1', 'x', 1, { event: 'question' }))).toBe('question')
    expect(kindOf(notif('c', 't1', 'x', 1, { event: 'done' }))).toBe('done')
    expect(kindOf(notif('d', 't1', 'x', 1))).toBe('all')
  })
})

describe('NotificationsStore filters', () => {
  beforeEach(() => {
    stored = [
      notif('a', 't1', 'alpha', 40, { event: 'question' }),
      notif('b', 't1', 'alpha', 30, { event: 'done' }),
      notif('c', 't2', 'beta', 20, { event: 'done' }),
      notif('d', 't3', 'beta', 10, { kind: 'reminder' })
    ]
    store.setProjectFilter('')
    store.setKindFilter('all')
    store.reload()
  })

  it('groups everything when no filter is set', () => {
    expect(store.groups.map((g) => g.key)).toEqual(['pane:t1', 'pane:t2', 'pane:t3'])
  })

  it('filters by project', () => {
    store.setProjectFilter('beta')
    expect(store.groups.flatMap((g) => g.items.map((n) => n.id))).toEqual(['c', 'd'])
  })

  it('filters by kind', () => {
    store.setKindFilter('done')
    expect(store.groups.flatMap((g) => g.items.map((n) => n.id))).toEqual(['b', 'c'])
  })

  it('combines both filters', () => {
    store.setProjectFilter('alpha')
    store.setKindFilter('question')
    expect(store.groups.flatMap((g) => g.items.map((n) => n.id))).toEqual(['a'])
  })

  it('counts the project chips against the active kind filter', () => {
    expect(store.projectChips).toEqual([
      { project: 'alpha', count: 2 },
      { project: 'beta', count: 2 }
    ])

    store.setKindFilter('question')
    expect(store.projectChips).toEqual([{ project: 'alpha', count: 1 }])
  })

  it('dismisses a whole group at once', () => {
    const group = store.groups[0]
    store.dismissGroup(group)

    expect(stored.map((n) => n.id)).toEqual(['c', 'd'])
    expect(store.groups.map((g) => g.key)).toEqual(['pane:t2', 'pane:t3'])
  })

  it('drops a project filter whose notifications are all gone', () => {
    store.setProjectFilter('alpha')
    store.dismissGroup(store.groups[0])

    expect(store.projectFilter).toBe('')
    expect(store.groups).toHaveLength(2)
  })
})
