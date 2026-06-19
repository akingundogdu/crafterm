// Pure formatting helpers for the notifications panel: relative time, a trimmed
// path tail, and a shortened Claude model label. No state/DOM — unit-testable.

// Relative "just now / Nm / Nh / Nd ago" label. `now` is injectable for tests.
export function relTime(ms: number, now: number = Date.now()): string {
  const s = Math.max(0, (now - ms) / 1000)
  if (s < 60) return 'just now'
  const m = s / 60
  if (m < 60) return `${Math.floor(m)}m ago`
  const h = m / 60
  if (h < 24) return `${Math.floor(h)}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// Last `n` path segments, prefixed with an ellipsis when trimmed (e.g. …/a/b/c).
export function pathTail(p: string, n = 3): string {
  const parts = p.replace(/\/+$/, '').split('/').filter(Boolean)
  if (parts.length <= n) return p
  return '…/' + parts.slice(-n).join('/')
}

// Shorten a model id for the usage chip, e.g. claude-opus-4-8 → opus-4.8.
export function shortModel(m: string | null): string {
  if (!m) return ''
  return m
    .replace(/^claude-/, '')
    .replace(/-(\d{8})$/, '')
    .replace(/-(\d)-(\d)$/, '-$1.$2')
}
