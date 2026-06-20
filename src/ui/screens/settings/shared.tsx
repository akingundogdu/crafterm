import type { SubTab, SubTabsOptions } from './shared.types'
import { makeInputChange, makeSelectChange } from './shared.state'

export type { SubTab, SubTabsOptions } from './shared.types'
export { settingsCleanups, toHex6 } from './shared.state'

// Shared form controls for the settings panels. Each per-tab panel module consumes
// these so the markup stays consistent across the settings screen.

// Render a horizontal sub-tab strip with one body panel shown at a time.
// Each tab's `build` runs once, lazily, the first time its tab is shown.
export function buildSubTabs(parent: HTMLElement, tabs: SubTab[], opts?: SubTabsOptions): void {
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
  const input = (<input type={type} onChange={makeInputChange(onChange)} />) as HTMLInputElement
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
  const sel = (<select onChange={makeSelectChange(onChange)} />) as HTMLSelectElement
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
