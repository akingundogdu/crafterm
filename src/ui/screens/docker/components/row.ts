import { createButton } from '@ui/components'

// DOM builders for the Docker list rows. Action handlers are injected via
// RowAction.run, so this module carries no IPC/state imports.

export interface RowAction {
  label: string
  cls?: string
  run: () => void
}

export function makeRow(opts: {
  title: string
  sub: string
  meta?: string
  badge?: { text: string; cls: string }
  search: string
  actions: RowAction[]
}): HTMLElement {
  const row = document.createElement('div')
  row.className = 'docker-row'
  row.dataset.search = opts.search.toLowerCase()

  const main = document.createElement('div')
  main.className = 'docker-row-main'
  const titleRow = document.createElement('div')
  titleRow.className = 'docker-row-title'
  if (opts.badge) {
    const b = document.createElement('span')
    b.className = 'docker-badge ' + opts.badge.cls
    b.textContent = opts.badge.text
    titleRow.appendChild(b)
  }
  const name = document.createElement('span')
  name.className = 'docker-row-name'
  name.textContent = opts.title
  name.title = opts.title
  titleRow.appendChild(name)
  main.appendChild(titleRow)
  const sub = document.createElement('div')
  sub.className = 'docker-row-sub'
  sub.textContent = opts.sub
  sub.title = opts.sub
  main.appendChild(sub)
  if (opts.meta) {
    const meta = document.createElement('div')
    meta.className = 'docker-row-meta'
    meta.textContent = opts.meta
    main.appendChild(meta)
  }

  const acts = document.createElement('div')
  acts.className = 'docker-row-actions'
  opts.actions.forEach((a) => {
    acts.appendChild(
      createButton({
        className: 'docker-act' + (a.cls ? ' ' + a.cls : ''),
        text: a.label,
        title: a.label,
        onClick: (e) => {
          e.stopPropagation()
          a.run()
        }
      })
    )
  })

  row.append(main, acts)
  return row
}

export function fillEmpty(list: HTMLElement, label: string): void {
  list.replaceChildren()
  const e = document.createElement('div')
  e.className = 'docker-empty-row'
  e.textContent = label
  list.appendChild(e)
}
