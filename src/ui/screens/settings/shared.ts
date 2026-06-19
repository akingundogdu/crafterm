// Shared state + form controls for the settings panels. Extracted from the
// settings monolith so each per-tab panel module can consume them. settingsCleanups
// is a stable array (cleared in place by openSettings) holding teardown callbacks
// run when the modal closes — e.g. stopping shortcut recording.

export const settingsCleanups: (() => void)[] = []

export function toHex6(v: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v
  if (/^#[0-9a-fA-F]{3}$/.test(v)) return '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3]
  return '#000000'
}

// Render a horizontal sub-tab strip with one body panel shown at a time.
// Each tab's `build` runs once, lazily, the first time its tab is shown.
export function buildSubTabs(
  parent: HTMLElement,
  tabs: { label: string; build: (el: HTMLElement) => void }[],
  opts?: { initialIndex?: number; onTabChange?: (idx: number) => void }
): void {
  const bar = document.createElement('div')
  bar.className = 'settings-subtabs'
  const body = document.createElement('div')
  body.className = 'settings-subtab-body'
  parent.append(bar, body)
  const btns: HTMLButtonElement[] = []
  const panels: HTMLElement[] = []
  const built: boolean[] = []
  const show = (i: number): void => {
    btns.forEach((b, j) => b.classList.toggle('active', j === i))
    panels.forEach((p, j) => (p.style.display = j === i ? 'block' : 'none'))
    if (!built[i]) {
      tabs[i].build(panels[i])
      built[i] = true
    }
    opts?.onTabChange?.(i)
  }
  tabs.forEach((t, i) => {
    const b = document.createElement('button')
    b.className = 'settings-subtab'
    b.textContent = t.label
    b.addEventListener('click', () => show(i))
    const p = document.createElement('div')
    p.className = 'settings-subtab-panel'
    p.style.display = 'none'
    btns.push(b)
    panels.push(p)
    built.push(false)
    bar.appendChild(b)
    body.appendChild(p)
  })
  if (tabs.length) {
    const start = opts?.initialIndex ?? 0
    show(start >= 0 && start < tabs.length ? start : 0)
  }
}

export function labeledInput(
  parent: HTMLElement,
  label: string,
  type: string,
  value: string,
  onChange: (v: string) => void
): HTMLInputElement {
  const field = document.createElement('div')
  field.className = 'field'
  const lab = document.createElement('label')
  lab.textContent = label
  const input = document.createElement('input')
  input.type = type
  input.value = value
  input.addEventListener('change', () => onChange(input.value))
  field.append(lab, input)
  parent.appendChild(field)
  return input
}

export function labeledSelect(
  parent: HTMLElement,
  label: string,
  options: [string, string][],
  selected: string,
  onChange: (v: string) => void
): HTMLSelectElement {
  const field = document.createElement('div')
  field.className = 'field'
  const lab = document.createElement('label')
  lab.textContent = label
  const sel = document.createElement('select')
  options.forEach(([val, text]) => {
    const o = document.createElement('option')
    o.value = val
    o.textContent = text
    if (val === selected) o.selected = true
    sel.appendChild(o)
  })
  sel.addEventListener('change', () => onChange(sel.value))
  field.append(lab, sel)
  parent.appendChild(field)
  return sel
}
