import type { TreeContext } from '../treeview.types'
import { zoneFor, dropClass } from '../treeview.state'

// Wire drag-reorder/nesting (before / after / inside) onto a single row. Reads
// and mutates the shared drag id through the context; `clearDropMarks` removes
// the zone markers across the whole host.
export function wireDragDrop<T>(
  ctx: TreeContext<T>,
  node: T,
  id: string,
  row: HTMLDivElement,
  container: boolean
): void {
  const { a } = ctx
  const canDrag = a.draggable ? a.draggable(node) : true
  if (canDrag && a.onMove) {
    row.draggable = true
    row.addEventListener('dragstart', (e) => {
      ctx.setDragId(id)
      e.dataTransfer?.setData('text/plain', id)
      row.classList.add('dragging')
    })
    row.addEventListener('dragend', () => {
      ctx.setDragId(null)
      row.classList.remove('dragging')
      ctx.clearDropMarks()
    })
  }
  if (a.onMove) {
    row.addEventListener('dragover', (e) => {
      const dragId = ctx.getDragId()
      if (!dragId || dragId === id) return
      e.preventDefault()
      e.stopPropagation()
      ctx.clearDropMarks()
      row.classList.add(dropClass(zoneFor(e, row, container)))
    })
    row.addEventListener('dragleave', () => ctx.clearDropMarks())
    row.addEventListener('drop', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const pos = zoneFor(e, row, container)
      ctx.clearDropMarks()
      const dragId = ctx.getDragId()
      if (dragId && dragId !== id) a.onMove?.(dragId, id, pos)
      ctx.setDragId(null)
    })
  }
}

// Remove all in-flight drop-zone markers from the host.
export function clearDropMarks(host: HTMLElement): void {
  host.querySelectorAll('.drag-before,.drag-after,.drag-into').forEach((el) => {
    el.classList.remove('drag-before', 'drag-after', 'drag-into')
  })
}
