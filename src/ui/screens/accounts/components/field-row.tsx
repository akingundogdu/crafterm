import type { AccountField } from '@ui/types/types'

// One field row on an account card: a key, its (optionally masked) value, a copy
// button, and — for secrets — a reveal button. Pure factory: copy/reveal handlers
// are injected. `onReveal` receives the rendered value element so the caller can
// toggle it in place.
export function fieldRow(opts: {
  field: AccountField
  onCopy: (e: Event) => void
  onReveal: (valEl: HTMLSpanElement) => (e: Event) => void
}): HTMLElement {
  const f = opts.field
  const val = (
    <span class={'accounts-meta-val' + (f.secret ? ' accounts-secret' : '')}>
      {f.secret ? '••••••••' : f.value ?? ''}
    </span>
  ) as HTMLSpanElement
  return (
    <div class="accounts-meta-row">
      <span class="accounts-meta-key">{f.key}</span>
      {val}
      <button class="accounts-action small" onClick={opts.onCopy}>
        Copy
      </button>
      {f.secret && (
        <button class="accounts-action small" onClick={opts.onReveal(val)}>
          Show
        </button>
      )}
    </div>
  ) as HTMLDivElement
}
