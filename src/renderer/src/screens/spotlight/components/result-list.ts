// Spotlight result list: owns the `.spot-list` element, the current entries, the
// selection index, and row rendering. The badge label resolver is injected so
// the component pulls no business/IPC modules and renders in isolation.

import type { GsEntry } from '../../pickers/pickers'

export type SpotSource =
  | GsEntry['source']
  | 'file'
  | 'command'
  | 'claude'
  | 'shortcut'
  | 'app'
  | 'task'
  | 'reminder'
  | 'backlog'

export interface SpotEntry {
  source: SpotSource
  label: string
  detail?: string
  run: () => void
  altRun?: () => void // ⌘⏎ alternate action (e.g. split instead of open)
}

export interface ResultListHandle {
  el: HTMLDivElement
  setItems: (items: SpotEntry[], showBadge: boolean) => void
  setLoading: () => void
  move: (delta: number) => void
  selected: () => SpotEntry | undefined
}

export function createResultList(opts: {
  onChoose: (e: SpotEntry) => void
  badgeFor: (source: SpotSource) => string
}): ResultListHandle {
  const el = document.createElement('div')
  el.className = 'pick-list picker-list spot-list'

  let items: SpotEntry[] = []
  let showBadge = false
  let sel = 0

  const highlight = (): void => {
    el.querySelectorAll<HTMLElement>('.spot-row').forEach((row, i) => {
      row.classList.toggle('active', i === sel)
    })
  }

  const render = (): void => {
    if (sel >= items.length) sel = Math.max(0, items.length - 1)
    el.replaceChildren()
    if (!items.length) {
      el.insertAdjacentHTML('beforeend', '<div class="empty-hint">No matches</div>')
      return
    }
    items.forEach((e, i) => {
      const row = document.createElement('button')
      row.className = 'pick-row spot-row' + (i === sel ? ' active' : '')
      if (showBadge) {
        const badge = document.createElement('span')
        badge.className = 'gs-badge gs-' + e.source
        badge.textContent = opts.badgeFor(e.source)
        row.append(badge)
      }
      const lab = document.createElement('span')
      lab.className = 'gs-label'
      lab.textContent = e.label
      row.append(lab)
      if (e.detail) {
        const sub = document.createElement('span')
        sub.className = 'gs-detail'
        sub.textContent = e.detail
        row.append(sub)
      }
      row.addEventListener('click', () => opts.onChoose(e))
      row.addEventListener('mouseenter', () => {
        sel = i
        highlight()
      })
      el.appendChild(row)
    })
  }

  return {
    el,
    setItems: (next, badge) => {
      items = next
      showBadge = badge
      sel = 0
      render()
    },
    setLoading: () => {
      items = []
      el.replaceChildren()
      el.insertAdjacentHTML('beforeend', '<div class="empty-hint">Loading…</div>')
    },
    move: (delta) => {
      sel = Math.min(items.length - 1, Math.max(0, sel + delta))
      highlight()
    },
    selected: () => items[sel]
  }
}
