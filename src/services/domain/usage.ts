import type { ClaudeRealUsage } from '@bridge/api'

// Pure shaping for the Claude usage chip/popover: reset-time formatting and
// error-message strings. No DOM, no IPC — `now` is injectable for tests.

type UsageError = NonNullable<ClaudeRealUsage['error']>

// Human-friendly reset time: "Today HH:MM" / "Tomorrow HH:MM" / "Mon D HH:MM".
export function fmtResetTime(ms: number, now: number = Date.now()): string {
  const d = new Date(ms)
  const today = new Date(now)
  const sameDay = d.toDateString() === today.toDateString()
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (sameDay) return `Today ${time}`
  const tmr = new Date(now + 86_400_000)
  if (d.toDateString() === tmr.toDateString()) return `Tomorrow ${time}`
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + time
}

// Short chip label for a usage fetch error.
export function usageErrorShort(e: UsageError): string {
  if (e === 'no-token') return 'no token'
  if (e === 'auth-expired') return 'auth expired'
  return 'unavailable'
}

// Full tooltip/popover message for a usage fetch error.
export function usageErrorLong(e: UsageError): string {
  if (e === 'no-token')
    return 'No Claude OAuth token found. Set the keychain service or a fallback secret in Settings.'
  if (e === 'auth-expired')
    return 'Claude OAuth token expired. Open Claude Code to re-authenticate.'
  return 'Could not reach the Claude usage endpoint.'
}
