import { describe, it, expect } from 'vitest'
import { applicationSchema, makeApplication, makeFeature, makeProjectCommand } from './application'
import { iosConfigSchema, makeIosConfig } from './ios-config'
import { paletteCommandSchema, makePaletteCommand } from './palette-command'
import { sshConnectionSchema, makeSshConnection } from './ssh-connection'
import { dbConnectionSchema, makeDbConnection } from './db-connection'
import { actionMenuItemSchema } from './action-menu-item'
import { appNotificationSchema } from './notification'

describe('catalog + misc entities', () => {
  it('application + sub-entities validate', () => {
    expect(applicationSchema.safeParse(makeApplication({ name: 'backend' })).success).toBe(true)
    expect(makeFeature('auth').name).toBe('auth')
    expect(makeProjectCommand({ name: 'deploy', command: 'npm run deploy' }).command).toBe('npm run deploy')
  })
  it('ios-config defaults to empty (auto-detect)', () => {
    const c = makeIosConfig()
    expect(c.copyFiles).toEqual([])
    expect(iosConfigSchema.safeParse(c).success).toBe(true)
  })
  it('palette + ssh validate', () => {
    expect(paletteCommandSchema.safeParse(makePaletteCommand({ category: 'git', name: 'Status', command: 'git status' })).success).toBe(true)
    expect(sshConnectionSchema.safeParse(makeSshConnection({ label: 'box', host: '1.2.3.4' })).success).toBe(true)
  })
  it('db-connection validates engine + rejects bad engine', () => {
    expect(dbConnectionSchema.safeParse(makeDbConnection({ name: 'pg', engine: 'postgres' })).success).toBe(true)
    expect(dbConnectionSchema.safeParse({ id: '1', name: 'x', engine: 'oracle' }).success).toBe(false)
  })
  it('action-menu-item + notification validate', () => {
    expect(actionMenuItemSchema.safeParse({ id: '1', title: 'X', kind: 'builtin', builtinId: 'improve' }).success).toBe(true)
    expect(
      appNotificationSchema.safeParse({
        id: 'n1', paneId: 'p1', title: 'T', group: '', message: 'm', time: 1, event: 'done', branch: null
      }).success
    ).toBe(true)
  })
})
