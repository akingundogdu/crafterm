import { describe, it, expect, vi, beforeEach } from 'vitest'

// Keychain read goes through `security` via execFile; control its output per test.
const exec = { err: null as Error | null, stdout: '' }
vi.mock('child_process', () => ({
  execFile: (_cmd: string, _args: string[], _opts: unknown, cb: (e: Error | null, out: string) => void) =>
    cb(exec.err, exec.stdout)
}))

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import * as account from './claude-account.service'

function res(body: unknown, ok = true, status = 200): { ok: boolean; status: number; json: () => Promise<unknown> } {
  return { ok, status, json: async () => body }
}

beforeEach(() => {
  exec.err = null
  exec.stdout = ''
  fetchMock.mockReset()
})

describe('claude-account.parseTokenBlob', () => {
  it('handles raw token, JSON claudeAiOauth, bare object, and garbage', () => {
    expect(account.parseTokenBlob(null)).toEqual({ accessToken: null, refreshToken: null, expiresAt: 0 })
    expect(account.parseTokenBlob('raw-token')).toEqual({ accessToken: 'raw-token', refreshToken: null, expiresAt: 0 })
    expect(
      account.parseTokenBlob('{"claudeAiOauth":{"accessToken":"at","refreshToken":"rt","expiresAt":123}}')
    ).toEqual({ accessToken: 'at', refreshToken: 'rt', expiresAt: 123 })
    expect(account.parseTokenBlob('{"accessToken":"bare"}')).toEqual({ accessToken: 'bare', refreshToken: null, expiresAt: 0 })
    expect(account.parseTokenBlob('{not json')).toEqual({ accessToken: '{not json', refreshToken: null, expiresAt: 0 })
  })
})

describe('claude-account.toWindow', () => {
  it('parses utilization + ISO/numeric resets_at, rejects bad shapes', () => {
    expect(account.toWindow({ utilization: 73, resets_at: '2026-01-01T00:00:00.000Z' })).toEqual({
      utilization: 73,
      resetsAt: Date.UTC(2026, 0, 1)
    })
    expect(account.toWindow({ utilization: 10, resets_at: 1_700_000_000 })).toEqual({
      utilization: 10,
      resetsAt: 1_700_000_000_000
    })
    expect(account.toWindow(null)).toBeNull()
    expect(account.toWindow({ utilization: 'nope' })).toBeNull()
  })
})

describe('claude-account.fetchUsage', () => {
  it('maps the usage payload windows + model name', async () => {
    fetchMock.mockResolvedValue(
      res({
        five_hour: { utilization: 50, resets_at: 1_700_000_000 },
        seven_day: { utilization: 20, resets_at: 1_700_000_000 },
        model: { display_name: 'Claude Opus' }
      })
    )
    const out = await account.fetchUsage('tok')
    expect(out).toMatchObject({
      fiveHour: { utilization: 50 },
      sevenDay: { utilization: 20 },
      sevenDaySonnet: null,
      modelName: 'Claude Opus'
    })
  })

  it('returns the status on a non-ok response', async () => {
    fetchMock.mockResolvedValue(res({}, false, 401))
    expect(await account.fetchUsage('tok')).toEqual({ status: 401 })
  })
})

describe('claude-account.realUsage', () => {
  it('returns no-token when the keychain is empty and no fallback', async () => {
    exec.stdout = ''
    const out = await account.realUsage({ force: true })
    expect(out.error).toBe('no-token')
  })

  it('fetches usage with the keychain token', async () => {
    exec.stdout = '{"claudeAiOauth":{"accessToken":"at"}}'
    fetchMock.mockResolvedValue(res({ five_hour: { utilization: 42, resets_at: 1_700_000_000 } }))
    const out = await account.realUsage({ force: true })
    expect(out.error).toBeUndefined()
    expect(out.fiveHour).toEqual({ utilization: 42, resetsAt: 1_700_000_000_000 })
  })

  it('refreshes on 401 then retries the usage fetch', async () => {
    exec.stdout = '{"claudeAiOauth":{"accessToken":"stale","refreshToken":"rt"}}'
    fetchMock
      .mockResolvedValueOnce(res({}, false, 401)) // first usage call → unauthorized
      .mockResolvedValueOnce(res({ access_token: 'fresh' })) // token refresh
      .mockResolvedValueOnce(res({ five_hour: { utilization: 7, resets_at: 1_700_000_000 } })) // retry
    const out = await account.realUsage({ force: true })
    expect(out.error).toBeUndefined()
    expect(out.fiveHour?.utilization).toBe(7)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('caches a successful result for subsequent non-forced calls', async () => {
    exec.stdout = '{"claudeAiOauth":{"accessToken":"at"}}'
    fetchMock.mockResolvedValue(res({ five_hour: { utilization: 99, resets_at: 1_700_000_000 } }))
    await account.realUsage({ force: true }) // populates cache
    fetchMock.mockResolvedValue(res({ five_hour: { utilization: 1, resets_at: 1_700_000_000 } }))
    const cached = await account.realUsage({}) // no force → served from cache
    expect(cached.fiveHour?.utilization).toBe(99)
  })
})
