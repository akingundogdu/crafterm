import { execFile } from 'child_process'
import { BIN } from './exec'

// Real ("server-side") Claude usage windows, fetched from the Anthropic OAuth
// usage endpoint using the credential Claude Code stores in the macOS keychain.
// Self-contained: keychain read (security CLI) + token refresh + usage fetch,
// with a short in-memory cache so the renderer can poll cheaply.

export interface RealUsageWindow {
  utilization: number // 0-100
  resetsAt: number // ms epoch
}
export interface RealUsage {
  fiveHour: RealUsageWindow | null
  sevenDay: RealUsageWindow | null
  sevenDaySonnet: RealUsageWindow | null
  modelName: string | null
  fetchedAt: number
  error?: 'no-token' | 'auth-expired' | 'network' | 'unavailable'
}
interface OAuthToken {
  accessToken: string | null
  refreshToken: string | null
  expiresAt: number // ms epoch, 0 if unknown
}
const CLAUDE_OAUTH_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e'
const CLAUDE_OAUTH_TOKEN_URL = 'https://platform.claude.com/v1/oauth/token'
const CLAUDE_USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'
let realUsageCache: { expiresAt: number; data: RealUsage } | null = null

// Parse a stored credential blob. Claude's keychain entry is JSON
// (`{ claudeAiOauth: { accessToken, refreshToken, expiresAt } }`); a user
// fallback secret may be that same shape, a bare `{ accessToken }`, or a raw token.
export function parseTokenBlob(raw: string | null): OAuthToken {
  if (!raw) return { accessToken: null, refreshToken: null, expiresAt: 0 }
  const trimmed = raw.trim()
  if (!trimmed.startsWith('{')) return { accessToken: trimmed, refreshToken: null, expiresAt: 0 }
  try {
    const o = JSON.parse(trimmed) as Record<string, unknown>
    const oauth = (o.claudeAiOauth as Record<string, unknown>) ?? o
    return {
      accessToken: typeof oauth.accessToken === 'string' ? oauth.accessToken : null,
      refreshToken: typeof oauth.refreshToken === 'string' ? oauth.refreshToken : null,
      expiresAt: Number(oauth.expiresAt) || 0
    }
  } catch {
    return { accessToken: trimmed, refreshToken: null, expiresAt: 0 }
  }
}

export function readKeychainBlob(service: string): Promise<string | null> {
  return new Promise((resolve) => {
    if (!service) return resolve(null)
    execFile(
      BIN.security,
      ['find-generic-password', '-s', service, '-w'],
      { timeout: 3000 },
      (err, stdout) => resolve(err ? null : (stdout || '').trim() || null)
    )
  })
}

// Best-effort refresh: only used when the stored access token is expired/rejected.
// Kept in memory — we deliberately do NOT write back to the keychain so Claude
// Code stays the single owner of the credential.
export async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  try {
    const res = await fetch(CLAUDE_OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: CLAUDE_OAUTH_CLIENT_ID
      }),
      signal: AbortSignal.timeout(5000)
    })
    if (!res.ok) return null
    const j = (await res.json()) as Record<string, unknown>
    return typeof j.access_token === 'string' ? j.access_token : null
  } catch {
    return null
  }
}

export function toWindow(o: unknown): RealUsageWindow | null {
  if (!o || typeof o !== 'object') return null
  const r = o as Record<string, unknown>
  const util = Number(r.utilization)
  if (!Number.isFinite(util)) return null
  // `utilization` is already a 0-100 percentage. `resets_at` is an ISO-8601
  // string (or null); an older shape used a Unix-seconds number — handle both.
  let resetsAt = 0
  if (typeof r.resets_at === 'string') resetsAt = new Date(r.resets_at).getTime() || 0
  else if (typeof r.resets_at === 'number' && Number.isFinite(r.resets_at))
    resetsAt = r.resets_at < 1e12 ? r.resets_at * 1000 : r.resets_at
  return { utilization: util, resetsAt }
}

export async function fetchUsage(accessToken: string): Promise<RealUsage | { status: number }> {
  const res = await fetch(CLAUDE_USAGE_URL, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`
    },
    signal: AbortSignal.timeout(5000)
  })
  if (!res.ok) return { status: res.status }
  const j = (await res.json()) as Record<string, unknown>
  const model = j.model as Record<string, unknown> | undefined
  return {
    fiveHour: toWindow(j.five_hour),
    sevenDay: toWindow(j.seven_day),
    sevenDaySonnet: toWindow(j.seven_day_sonnet),
    modelName:
      model && typeof model.display_name === 'string' ? (model.display_name as string) : null,
    fetchedAt: Date.now()
  }
}

export async function realUsage(opts: {
  keychainService?: string
  fallbackToken?: string | null
  force?: boolean
}): Promise<RealUsage> {
  const now = Date.now()
  if (!opts?.force && realUsageCache && realUsageCache.expiresAt > now) return realUsageCache.data
  const fail = (error: RealUsage['error']): RealUsage => {
    const data: RealUsage = {
      fiveHour: null,
      sevenDay: null,
      sevenDaySonnet: null,
      modelName: null,
      fetchedAt: now,
      error
    }
    realUsageCache = { expiresAt: now + 60_000, data }
    return data
  }

  const service = opts?.keychainService || 'Claude Code-credentials'
  let token = parseTokenBlob(await readKeychainBlob(service))
  if (!token.accessToken && opts?.fallbackToken) token = parseTokenBlob(opts.fallbackToken)
  if (!token.accessToken) return fail('no-token')

  try {
    let result = await fetchUsage(token.accessToken)
    if ('status' in result && result.status === 401 && token.refreshToken) {
      const fresh = await refreshAccessToken(token.refreshToken)
      if (fresh) result = await fetchUsage(fresh)
    }
    if ('status' in result) return fail(result.status === 401 ? 'auth-expired' : 'unavailable')
    realUsageCache = { expiresAt: now + 60_000, data: result }
    return result
  } catch {
    return fail('network')
  }
}
