import { renderMarkdown } from '@views/markdown/markdown'
import { makeDocSave } from './doc-save.engine'
import { makeDocReload } from './doc-reload.engine'

export interface EditorLifecycleDeps {
  source: string
  absolute: boolean
  preview: HTMLDivElement
  editor: HTMLTextAreaElement
  refreshBtn: HTMLButtonElement
  editBtn: HTMLButtonElement
}

// Owns the closure-coupled doc state (`editing`, `raw`) and wires the
// edit/preview toggle, save-on-exit, Cmd+S save, and the ⟳ reload button.
// Kicks off the initial disk read. Byte-identical to the inline createDocPane
// logic; the only change is that `editing`/`raw` now live here and are threaded
// to the reload engine via getter/setter.
export function setupEditorLifecycle(deps: EditorLifecycleDeps): void {
  const { source, absolute, preview, editor, refreshBtn, editBtn } = deps

  let editing = false
  let raw = ''
  const saveDoc = makeDocSave(source, absolute)
  const reload = makeDocReload({
    source,
    absolute,
    editor,
    preview,
    isEditing: () => editing,
    setRaw: (content) => {
      raw = content
    }
  })

  void reload()
  refreshBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    void reload()
  })
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    if (editing) {
      // leaving edit mode -> save + re-render
      raw = editor.value
      saveDoc(raw)
      preview.innerHTML = renderMarkdown(raw)
    }
    editing = !editing
    editBtn.textContent = editing ? 'Preview' : 'Edit'
    preview.style.display = editing ? 'none' : 'block'
    editor.style.display = editing ? 'block' : 'none'
    if (editing) editor.focus()
  })
  // Cmd+S saves while editing
  editor.addEventListener('keydown', (e) => {
    e.stopPropagation()
    if (e.metaKey && e.key.toLowerCase() === 's') {
      e.preventDefault()
      raw = editor.value
      saveDoc(raw)
    }
  })
}
