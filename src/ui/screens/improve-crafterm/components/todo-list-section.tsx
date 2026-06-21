import type { Section } from '../todo-doc'
import type { Entry, RowAction } from '../improve-crafterm.types'
import type { TodoRowOptions } from './todo-row'

// Renders the Todo list (in-progress + backlog, with drag-to-reorder) into `list`.
// The row builder, subhead helper, and persistence/re-render callbacks are
// injected so this module keeps no working model or IPC of its own.

export interface TodoListSectionCallbacks {
  buildRow: (entry: Entry, opts: TodoRowOptions) => HTMLElement
  addSubhead: (list: HTMLElement, label: string) => void
  moveEntry: (entry: Entry, targetHeading: string, toTop: boolean) => Promise<void>
  save: () => Promise<boolean>
  render: () => void
}

export function fillTodoList(
  list: HTMLElement,
  progEntries: Entry[],
  backEntries: Entry[],
  backlog: Section | undefined,
  cb: TodoListSectionCallbacks
): void {
  const splitGroups = progEntries.length > 0 && backEntries.length > 0
  const doneAction = (entry: Entry): RowAction => ({
    icon: '✓',
    title: 'Mark done',
    cls: 'mark-done',
    run: () => cb.moveEntry(entry, 'Done', true)
  })
  if (splitGroups) cb.addSubhead(list, '🤖 In progress')
  progEntries.forEach((entry, i) =>
    list.appendChild(cb.buildRow(entry, { editable: true, orderNum: i + 1, actions: [doneAction(entry)] }))
  )
  if (splitGroups) cb.addSubhead(list, 'Up next')
  // Drag to reorder backlog priority — file order is the AI's work order.
  let dragFrom: number | null = null
  backEntries.forEach((entry, i) => {
    const row = cb.buildRow(entry, { editable: true, nextUp: i === 0, orderNum: i + 1, actions: [doneAction(entry)] })
    row.draggable = true
    row.classList.add('draggable')
    row.addEventListener('dragstart', (e) => {
      dragFrom = i
      row.classList.add('dragging')
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
    })
    row.addEventListener('dragend', () => {
      dragFrom = null
      list.querySelectorAll('.improve-item').forEach((el) => el.classList.remove('dragging', 'drag-over'))
    })
    row.addEventListener('dragover', (e) => {
      e.preventDefault()
      row.classList.add('drag-over')
    })
    row.addEventListener('dragleave', () => row.classList.remove('drag-over'))
    row.addEventListener('drop', async (e) => {
      e.preventDefault()
      row.classList.remove('drag-over')
      if (dragFrom === null || dragFrom === i || !backlog) return
      const [moved] = backlog.items.splice(dragFrom, 1)
      backlog.items.splice(i, 0, moved)
      await cb.save()
      cb.render()
    })
    list.appendChild(row)
  })
}
