import { el } from '@views/lib/dom'
import type { TreeContext } from '../treeview.types'

// Inline rename flow: swap the label for an input, commit on Enter/blur, cancel
// on Escape, then re-render. The `renaming` guard (held in the parent closure)
// keeps a refresh tick from blowing away the in-progress input.
export function startRename<T>(ctx: TreeContext<T>, node: T, labelEl: HTMLElement): void {
  const { a } = ctx
  if (!a.onRename) return
  ctx.setRenaming(a.id(node))
  const input = el('input', { class: 'rename-input' })
  input.value = a.label(node)
  labelEl.replaceWith(input)
  input.focus()
  input.select()
  const commit = (save: boolean): void => {
    if (!ctx.isRenaming()) return
    ctx.setRenaming(null)
    const v = input.value.trim()
    if (save && v) a.onRename?.(node, v)
    ctx.rerender()
  }
  input.addEventListener('keydown', (ev) => {
    ev.stopPropagation()
    if (ev.key === 'Enter') commit(true)
    else if (ev.key === 'Escape') commit(false)
  })
  input.addEventListener('blur', () => commit(true))
}

// Open the inline rename editor on a node by id (public `beginRename`).
export function beginRename<T>(ctx: TreeContext<T>, id: string): void {
  const entry = ctx.getLive().find((r) => ctx.a.id(r.node) === id)
  const label = entry?.row.querySelector<HTMLElement>('.tab-title')
  if (entry && label) startRename(ctx, entry.node, label)
}
