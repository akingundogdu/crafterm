// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { createLineSelect, type LineRow, type LineSelectOptions } from '@ui/screens/diff/line-select'

afterEach(() => {
  document.body.innerHTML = ''
})

const ctx = (line: number | null, text = `line ${line}`): LineRow => ({
  className: line == null ? 'diff-row del' : 'diff-row ctx',
  gutter: line == null ? '' : String(line),
  text,
  line
})

const mount = (over: Partial<LineSelectOptions> = {}) => {
  const sendRef = vi.fn(() => true)
  const onRowSelect = vi.fn()
  const onSelectionCleared = vi.fn()
  const view = createLineSelect({
    refFile: () => 'a.ts',
    sendRef,
    onRowSelect,
    onSelectionCleared,
    ...over
  })
  document.body.appendChild(view.body)
  return { view, sendRef, onRowSelect, onSelectionCleared }
}

const rowEls = (view: ReturnType<typeof createLineSelect>) =>
  [...view.body.querySelectorAll<HTMLElement>('.diff-row')]
const mouse = (el: Element, type: string, init: MouseEventInit = {}) =>
  el.dispatchEvent(new MouseEvent(type, { bubbles: true, ...init }))

describe('createLineSelect', () => {
  it('renders a row per descriptor with gutter + text', () => {
    const { view } = mount()
    view.setRows([ctx(1), ctx(2)])
    const rows = rowEls(view)
    expect(rows).toHaveLength(2)
    expect(rows[0].querySelector('.diff-gutter')?.textContent).toBe('1')
    expect(rows[0].querySelector('.diff-text')?.textContent).toBe('line 1')
    expect(rows[0].dataset.line).toBe('1')
  })

  it('renders non-selectable rows (line null) without a dataset.line', () => {
    const { view, onRowSelect } = mount()
    view.setRows([ctx(null, 'removed'), ctx(5)])
    const rows = rowEls(view)
    expect(rows[0].dataset.line).toBeUndefined()
    mouse(rows[0], 'mousedown')
    expect(onRowSelect).not.toHaveBeenCalled() // del rows have no handler
  })

  it('click selects a single line and anchors the action cluster', () => {
    const { view, onRowSelect } = mount()
    view.setRows([ctx(10), ctx(11), ctx(12)])
    const rows = rowEls(view)
    mouse(rows[0], 'mousedown')
    expect(onRowSelect).toHaveBeenCalledOnce()
    expect(rows[0].classList.contains('selected')).toBe(true)
    expect(view.currentRange()).toEqual({ a: 10, b: 10 })
    expect(rows[0].querySelector('.diff-actions .diff-act-term')).toBeTruthy()
  })

  it('shift-click extends the range from the anchor', () => {
    const { view } = mount()
    view.setRows([ctx(10), ctx(11), ctx(12)])
    const rows = rowEls(view)
    mouse(rows[0], 'mousedown')
    mouse(rows[2], 'mousedown', { shiftKey: true })
    expect(view.currentRange()).toEqual({ a: 10, b: 12 })
    expect(rows.every((r) => r.classList.contains('selected'))).toBe(true)
  })

  it('click-drag extends while the mouse is held', () => {
    const { view } = mount()
    view.setRows([ctx(1), ctx(2), ctx(3)])
    const rows = rowEls(view)
    mouse(rows[0], 'mousedown')
    mouse(rows[2], 'mouseenter')
    expect(view.currentRange()).toEqual({ a: 1, b: 3 })
    mouse(document.body, 'mouseup')
    mouse(rows[1], 'mouseenter') // drag ended → no change
    expect(view.currentRange()).toEqual({ a: 1, b: 3 })
  })

  it('sends a single-line ref on + click', () => {
    const { view, sendRef } = mount()
    view.setRows([ctx(7), ctx(8)])
    const rows = rowEls(view)
    mouse(rows[0], 'mousedown')
    view.body.querySelector<HTMLButtonElement>('.diff-act-term')!.click()
    expect(sendRef).toHaveBeenCalledWith('a.ts:7')
  })

  it('sends a range ref and flags + when no terminal exists', () => {
    const sendRef = vi.fn(() => false)
    const { view } = mount({ sendRef })
    view.setRows([ctx(2), ctx(3), ctx(4)])
    const rows = rowEls(view)
    mouse(rows[0], 'mousedown')
    mouse(rows[2], 'mousedown', { shiftKey: true })
    const plus = view.body.querySelector<HTMLButtonElement>('.diff-act-term')!
    plus.click()
    expect(sendRef).toHaveBeenCalledWith('a.ts:2-4')
    expect(plus.classList.contains('warn')).toBe(true)
  })

  it('suppresses the ref when refFile returns null', () => {
    const sendRef = vi.fn(() => true)
    const { view } = mount({ sendRef, refFile: () => null })
    view.setRows([ctx(1)])
    mouse(rowEls(view)[0], 'mousedown')
    view.body.querySelector<HTMLButtonElement>('.diff-act-term')!.click()
    expect(sendRef).not.toHaveBeenCalled()
  })

  it('clearSelection empties the range and notifies', () => {
    const { view, onSelectionCleared } = mount()
    view.setRows([ctx(1), ctx(2)])
    mouse(rowEls(view)[0], 'mousedown')
    onSelectionCleared.mockClear()
    view.clearSelection()
    expect(view.currentRange()).toBeNull()
    expect(onSelectionCleared).toHaveBeenCalled()
  })

  it('setMessage clears rows and shows text', () => {
    const { view } = mount()
    view.setRows([ctx(1)])
    view.setMessage('Loading file…')
    expect(view.body.querySelector('.diff-row')).toBeNull()
    expect(view.body.textContent).toBe('Loading file…')
    expect(view.currentRange()).toBeNull()
  })

  it('setFont clamps and resetFont restores the default size', () => {
    const { view } = mount()
    expect(view.body.style.fontSize).toBe('12px')
    view.setFont(4)
    expect(view.body.style.fontSize).toBe('16px')
    view.setFont(99)
    expect(view.body.style.fontSize).toBe('28px') // MAX_FONT
    view.setFont(-99)
    expect(view.body.style.fontSize).toBe('8px') // MIN_FONT
    view.resetFont()
    expect(view.body.style.fontSize).toBe('12px')
  })

  it('appends extra actions after the + button', () => {
    const extra = document.createElement('button')
    extra.className = 'diff-act-comment'
    const { view } = mount({ extraActions: [extra] })
    view.setRows([ctx(1)])
    mouse(rowEls(view)[0], 'mousedown')
    const acts = [...view.body.querySelectorAll('.diff-actions > button')]
    expect(acts).toHaveLength(2)
    expect(acts[1].className).toBe('diff-act-comment')
  })

  it('destroy removes the document mouseup listener', () => {
    const { view } = mount()
    view.setRows([ctx(1), ctx(2), ctx(3)])
    const rows = rowEls(view)
    mouse(rows[0], 'mousedown') // dragging = true
    view.destroy()
    mouse(document.body, 'mouseup') // listener gone → drag is not ended
    mouse(rows[2], 'mouseenter') // still dragging → extends, proving removal
    expect(view.currentRange()).toEqual({ a: 1, b: 3 })
  })
})
