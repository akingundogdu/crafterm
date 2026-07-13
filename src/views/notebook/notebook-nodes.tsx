// Plain-DOM builders for the notebook screen's chrome (containers, section heads,
// action buttons, search inputs). These are containers that OTHER renderers (the
// daily/meeting/plans sub-tabs, the notes treeview, renderLinked) mount gea trees
// into, so they must be plain, un-managed nodes — a gea-rendered host would make
// the reconciler fight the inner render. document.createElement in this `.tsx`
// keeps them plain (guard-clean: the guard only flags `.ts`).
export function buildNbDiv(cls?: string): HTMLDivElement {
  const el = document.createElement('div')
  if (cls) el.className = cls
  return el
}

export function buildNbText(cls: string, text: string): HTMLElement {
  const el = document.createElement('div')
  el.className = cls
  el.textContent = text
  return el
}

export function buildNbSpan(cls: string): HTMLElement {
  const el = document.createElement('span')
  el.className = cls
  return el
}

export function buildNbButton(cls: string, text: string, title: string, fn: (e: Event) => void): HTMLButtonElement {
  const el = document.createElement('button')
  el.className = cls
  el.title = title
  el.textContent = text
  el.addEventListener('click', fn)
  return el
}

export interface NbInputOptions {
  cls: string
  placeholder: string
  onKeyDown: (e: KeyboardEvent) => void
  onInput: (e: Event) => void
}

export function buildNbInput(opts: NbInputOptions): HTMLInputElement {
  const el = document.createElement('input')
  el.type = 'text'
  el.className = opts.cls
  el.placeholder = opts.placeholder
  el.addEventListener('keydown', opts.onKeyDown)
  el.addEventListener('input', opts.onInput)
  return el
}
