// A status pill carrying a leading colored dot, for a consistent badge language.
export function statusTag(
  cls: string,
  text: string,
  opts?: { pulse?: boolean; title?: string }
): HTMLElement {
  const b = (
    <span class={'pr-status-tag ' + cls + (opts?.pulse ? ' pulse' : '')}>
      <span class="pr-status-dot" />
      {text}
    </span>
  ) as HTMLSpanElement
  if (opts?.title) b.title = opts.title
  return b
}
