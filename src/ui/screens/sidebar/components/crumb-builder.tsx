import type { Crumb } from '../sidebar.types'

export function buildCrumb(crumb: Crumb): HTMLElement {
  return (
    <div class="tab-crumb">
      <span
        class="crumb-dot"
        ref={(el: HTMLSpanElement) => {
          if (crumb.color) el.style.background = crumb.color
        }}
      />
      <span class="crumb-text">{crumb.text}</span>
    </div>
  ) as HTMLDivElement
}
