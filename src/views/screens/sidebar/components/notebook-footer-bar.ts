import { el } from '@views/lib/dom'
import type { SidebarFootersDeps } from './sidebar-footers.types'

// Notebook-mode footer bar: new note / folder / link external file + settings.
export function notebookFooterBar(deps: SidebarFootersDeps): HTMLDivElement {
  return el(
    'div',
    { id: 'notebook-footer' },
    el(
      'button',
      { id: 'nb-new-note', title: 'New note (⌘N)', onClick: deps.onNotebookNewNote },
      el('span', { class: 'btn-label' }, 'Note'),
      el('span', { class: 'kbd' }, '⌘N')
    ),
    el(
      'button',
      { id: 'nb-new-folder', title: 'New folder (⇧⌘N)', onClick: deps.onNotebookNewFolder },
      el('span', { class: 'btn-label' }, 'Folder'),
      el('span', { class: 'kbd' }, '⇧⌘N')
    ),
    el(
      'button',
      { id: 'nb-link-file', title: 'Link an external file to the notebook', onClick: deps.onNotebookLinkFile },
      el('span', { class: 'btn-label' }, 'Link')
    ),
    el('button', { id: 'nb-settings-btn', title: 'Settings (⌘,)', innerHTML: '&#9881;', onClick: deps.onSettings })
  )
}
