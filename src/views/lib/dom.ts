// Minimal plain-DOM element builder for the @views tree's IMPERATIVE widgets
// (e.g. the datepicker popover) that don't fit gea's reactive Component model.
// Most @views UI is gea JSX; reach for this only when porting a transient,
// self-managing widget where gea reactivity buys nothing. Self-contained (§2.7).
type Child = Node | string | number | null | undefined | false

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Record<string, unknown> | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue
      if (k === 'class') node.className = String(v)
      else if (k === 'innerHTML') node.innerHTML = String(v)
      else if (k.startsWith('on') && typeof v === 'function') {
        node.addEventListener(k.slice(2).toLowerCase(), v as EventListener)
      } else {
        node.setAttribute(k, String(v))
      }
    }
  }
  for (const c of children) {
    if (c == null || c === false) continue
    node.append(c instanceof Node ? c : document.createTextNode(String(c)))
  }
  return node
}
