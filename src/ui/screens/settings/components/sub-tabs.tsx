import type { SubTab, SubTabsOptions } from '../shared.types'

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
