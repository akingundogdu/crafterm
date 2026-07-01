// React-free automatic JSX runtime. esbuild/tsc compile `<div/>` into calls to
// `jsx`/`jsxs` here. There is NO virtual DOM and NO reactivity: every call builds
// a real DOM node immediately and returns it. Updates stay imperative (use a
// `ref` callback to grab the node and wire setters), matching the app's
// manager/hooks architecture. JSX is used for construction only.

export const Fragment = Symbol.for('crafterm.jsx.fragment')

type Props = Record<string, unknown> & { children?: unknown; ref?: (el: HTMLElement) => void }
type Component = (props: Props) => Node

function appendChildren(parent: Node, child: unknown): void {
  if (child == null || child === false || child === true) return
  if (Array.isArray(child)) {
    for (const c of child) appendChildren(parent, c)
    return
  }
  if (child instanceof Node) {
    parent.appendChild(child)
    return
  }
  parent.appendChild(document.createTextNode(String(child)))
}

function setProp(el: HTMLElement, key: string, value: unknown): void {
  if (key === 'children' || key === 'key' || key === 'ref') return
  if (value == null || value === false) return
  if (key === 'class' || key === 'className') {
    el.className = String(value)
    return
  }
  if (key === 'style') {
    if (typeof value === 'string') el.setAttribute('style', value)
    else Object.assign(el.style, value as Record<string, string>)
    return
  }
  if (key === 'dataset' && typeof value === 'object') {
    Object.assign(el.dataset, value as Record<string, string>)
    return
  }
  if (key === 'innerHTML') {
    el.innerHTML = String(value)
    return
  }
  if (key.startsWith('on') && typeof value === 'function') {
    el.addEventListener(key.slice(2).toLowerCase(), value as EventListener)
    return
  }
  if (value === true) {
    el.setAttribute(key, '')
    return
  }
  el.setAttribute(key, String(value))
}

export function jsx(type: string | typeof Fragment | Component, props: Props): Node {
  if (type === Fragment) {
    const frag = document.createDocumentFragment()
    appendChildren(frag, props.children)
    return frag
  }
  if (typeof type === 'function') {
    return type(props)
  }
  const el = document.createElement(type)
  for (const key in props) setProp(el, key, props[key])
  appendChildren(el, props.children)
  if (typeof props.ref === 'function') props.ref(el)
  return el
}

// `jsxs` is the multi-child variant; our `jsx` already handles array children.
export const jsxs = jsx

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace JSX {
  // A JSX expression is a real HTMLElement (the common case). Fragments return a
  // DocumentFragment at runtime — a known, accepted type-lie; cast where needed.
  export type Element = HTMLElement
  export interface ElementChildrenAttribute {
    children: unknown
  }
  // Loose intrinsic typing for now: any tag, any props. Tighten in Phase 5.
  export interface IntrinsicElements {
    [tag: string]: Record<string, unknown>
  }
}
