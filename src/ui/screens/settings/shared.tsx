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
  const bar = (<div class="settings-subtabs" />) as HTMLDivElement
  const body = (<div class="settings-subtab-body" />) as HTMLDivElement
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
    const b = (
      <button class="settings-subtab" onClick={() => show(i)}>
        {t.label}
      </button>
    ) as HTMLButtonElement
    const p = (<div class="settings-subtab-panel" style={{ display: 'none' }} />) as HTMLDivElement
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
  const input = (<input type={type} onChange={() => onChange(input.value)} />) as HTMLInputElement
  input.value = value
  const field = (
    <div class="field">
      <label>{label}</label>
      {input}
    </div>
  ) as HTMLDivElement
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
  const sel = (<select onChange={() => onChange(sel.value)} />) as HTMLSelectElement
  options.forEach(([val, text]) => {
    const o = (<option value={val}>{text}</option>) as HTMLOptionElement
    if (val === selected) o.selected = true
    sel.appendChild(o)
  })
  const field = (
    <div class="field">
      <label>{label}</label>
      {sel}
    </div>
  ) as HTMLDivElement
  parent.appendChild(field)
  return sel
}
