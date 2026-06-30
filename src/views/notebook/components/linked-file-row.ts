import { el } from '@views/lib/dom'
import { LINK_SVG, MD_RE, stopAnd } from '../notebook.state'

// A single linked-file row with its hover actions. Pure factory: the action
// handlers are injected so this module stays free of IPC/command imports.

interface LinkedFile {
  path: string
  name: string
}

interface LinkedFileRowActions {
  onOpen: (path: string) => void
  onReveal: (path: string) => void
  onUnlink: (path: string) => void
}

function actBtn(text: string, title: string, fn: (e: Event) => void): HTMLButtonElement {
  return el('button', { class: 'notebook-action', title, onClick: fn }, text)
}

export function buildLinkedFileRow(f: LinkedFile, a: LinkedFileRowActions): HTMLElement {
  const actions = el(
    'span',
    { class: 'nb-actions' },
    actBtn('⤴', 'Show in Finder', stopAnd(() => a.onReveal(f.path.slice(0, f.path.lastIndexOf('/')) || f.path))),
    actBtn('✕', 'Unlink', stopAnd(() => a.onUnlink(f.path)))
  )
  return el(
    'div',
    { class: 'tab-item nb-linked-row', title: f.path, onClick: () => a.onOpen(f.path) },
    el(
      'div',
      { class: 'tab-row' },
      el('span', { class: 'folder-icon', innerHTML: LINK_SVG }),
      el('span', { class: 'tab-title' }, MD_RE.test(f.name) ? f.name.replace(MD_RE, '') : f.name),
      actions
    )
  )
}
