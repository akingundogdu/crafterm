// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { state, settings } from '@ui/state'
import type { ProjectNode, DbNode, AppNotification } from '@ui/types'
import { notificationRepo } from './notification.repository'
import { applicationRepo } from './application.repository'
import { iosConfigRepo } from './ios-config.repository'
import { dbConnectionRepo } from './db-connection.repository'

const project = (id: string): ProjectNode => ({
  kind: 'project',
  id,
  name: id,
  color: null,
  collapsed: false,
  pinned: false,
  children: [],
  path: `/repo/${id}`
})

const notif = (id: string): AppNotification => ({
  id,
  paneId: 'p',
  title: id,
  group: 'g',
  message: 'm',
  time: 0
})

describe('notificationRepo (capped, newest-first, no persist)', () => {
  beforeEach(() => notificationRepo.clear())

  it('adds newest-first and supports get/query/remove/clear', () => {
    notificationRepo.add(notif('a'))
    notificationRepo.add(notif('b'))
    expect(notificationRepo.getAll().map((n) => n.id)).toEqual(['b', 'a'])
    expect(notificationRepo.get('a')?.id).toBe('a')
    expect(notificationRepo.query((n) => n.id === 'b')).toHaveLength(1)
    notificationRepo.remove('b')
    expect(notificationRepo.getAll().map((n) => n.id)).toEqual(['a'])
    notificationRepo.clear()
    expect(notificationRepo.getAll()).toHaveLength(0)
  })

  it('caps at 100 entries', () => {
    for (let i = 0; i < 120; i++) notificationRepo.add(notif(`n${i}`))
    expect(notificationRepo.getAll()).toHaveLength(100)
    expect(notificationRepo.getAll()[0].id).toBe('n119') // newest kept
  })
})

describe('applicationRepo (project-keyed, tree-traversing)', () => {
  beforeEach(() => {
    state.tree = [project('proj1'), project('proj2')]
  })

  it('upsert/list/get/remove scoped to the owning project', () => {
    applicationRepo.upsert('proj1', { id: 'app1', name: 'API', commands: {} })
    applicationRepo.upsert('proj1', { id: 'app2', name: 'Web', commands: {} })
    applicationRepo.upsert('proj2', { id: 'app3', name: 'Mobile', commands: {} })

    expect(applicationRepo.listForProject('proj1').map((a) => a.id)).toEqual(['app1', 'app2'])
    expect(applicationRepo.getAll()).toHaveLength(3)
    expect(applicationRepo.get('app3')?.name).toBe('Mobile')

    applicationRepo.upsert('proj1', { id: 'app1', name: 'API v2', commands: {} }) // update in place
    expect(applicationRepo.get('app1')?.name).toBe('API v2')
    expect(applicationRepo.listForProject('proj1')).toHaveLength(2)

    applicationRepo.remove('proj1', 'app1')
    expect(applicationRepo.listForProject('proj1').map((a) => a.id)).toEqual(['app2'])
  })
})

describe('iosConfigRepo (per-project singleton)', () => {
  beforeEach(() => {
    state.tree = [project('ios1')]
  })

  it('get/ensure/set against the owning project', () => {
    expect(iosConfigRepo.get('ios1')).toBeUndefined()
    const made = iosConfigRepo.ensure('ios1', () => ({
      project: '',
      scheme: '',
      baseBundleId: '',
      displayPrefix: '',
      defaultSimulator: '',
      copyFiles: [],
      worktreesDir: ''
    }))
    expect(made).toBeDefined()
    expect(iosConfigRepo.get('ios1')).toBe(made)
    iosConfigRepo.set('ios1', { ...made!, scheme: 'Prod' })
    expect(iosConfigRepo.get('ios1')?.scheme).toBe('Prod')
  })
})

describe('dbConnectionRepo (dbTree-traversing)', () => {
  beforeEach(() => {
    const tree: DbNode[] = [
      { kind: 'conn', id: 'n1', collapsed: false, conn: { id: 'c1', name: 'pg', engine: 'postgres' } },
      {
        kind: 'group',
        id: 'g1',
        name: 'grp',
        collapsed: false,
        children: [
          { kind: 'conn', id: 'n2', collapsed: false, conn: { id: 'c2', name: 'my', engine: 'mysql' } }
        ]
      }
    ]
    settings.dbTree = tree
  })

  it('flattens connections across the tree and updates in place', () => {
    expect(dbConnectionRepo.getAll().map((c) => c.id)).toEqual(['c1', 'c2'])
    expect(dbConnectionRepo.nodes()).toHaveLength(2)
    expect(dbConnectionRepo.get('c2')?.name).toBe('my')
    expect(dbConnectionRepo.query((c) => c.engine === 'postgres')).toHaveLength(1)

    dbConnectionRepo.update({ id: 'c2', name: 'my2', engine: 'mysql' }) // nested conn
    expect(dbConnectionRepo.get('c2')?.name).toBe('my2')
  })
})
