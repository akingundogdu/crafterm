// Key/value metadata row for an account card, with an optional copy button. Pure
// factory: the copy handler is injected so the component pulls no IPC/business
// modules.
export function metaRow(opts: {
  label: string
  value: string
  copyable: boolean
  onCopy: (e: Event) => void
}): HTMLElement {
  return (
    <div class="accounts-meta-row">
      <span class="accounts-meta-key">{opts.label}</span>
      <span class="accounts-meta-val">{opts.value}</span>
      {opts.copyable && (
        <button class="accounts-action small" onClick={opts.onCopy}>
          Copy
        </button>
      )}
    </div>
  ) as HTMLDivElement
}
