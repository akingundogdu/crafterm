// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Isolate the store from the live singletons: a controlled pane map + a spied
// debounced save. Keeps the heavy terminal/xterm import chain out of the test.
// Shared via vi.hoisted so the (hoisted) vi.mock factories can reference them.
const { panes, save } = vi.hoisted(() => ({
  panes: new Map<string, { id: string; el: HTMLElement; note?: string }>(),
  save: vi.fn()
}))
vi.mock('@views/state/spine', () => ({ panes }))
vi.mock('@repositories/persistence.service', () => ({ persistence: { save } }))

import { openNotePanel, closeNotePanel, writeNote, noteOf } from '@views/pane/components/note-panel.store'
import { mountNotePanel } from '@views/pane/components/note-panel'

// gea wires native event listeners that only fire once the node is connected to
// the document, so panes mount their box into document.body (matching the other
// component tests).
function fakePane(id: string, note?: string): { id: string; el: HTMLElement; note?: string } {
  const el = document.createElement('div')
  el.className = 'pane-box'
  document.body.append(el)
  const p = { id, el, note }
  panes.set(id, p)
  return p
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r))

describe('note panel', () => {
  beforeEach(() => {
    panes.clear()
    save.mockClear()
    document.body.innerHTML = ''
  })

  it('mounts the panel and fills the textarea with the initial value', async () => {
    const box = document.createElement('div')
    document.body.append(box)
    const el = mountNotePanel(box, { paneId: 'p1', initialValue: 'hello', onInput: () => {}, onClose: () => {} })
    expect(box.querySelector('.pane-note')).toBe(el)
    await tick() // onAfterRender seeds the value
    expect(box.querySelector<HTMLTextAreaElement>('.pane-note-input')?.value).toBe('hello')
  })

  it('writes the note onto the pane and triggers a persist', () => {
    const p = fakePane('p1')
    writeNote('p1', 'draft')
    expect(p.note).toBe('draft')
    expect(noteOf('p1')).toBe('draft')
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('opens the panel once and reuses it on a second open (no duplicate)', () => {
    const p = fakePane('p1', 'seed')
    openNotePanel('p1')
    openNotePanel('p1')
    expect(p.el.querySelectorAll('.pane-note').length).toBe(1)
  })

  it('persists edits typed into the textarea', () => {
    const p = fakePane('p1', '')
    openNotePanel('p1')
    const ta = p.el.querySelector<HTMLTextAreaElement>('.pane-note-input')!
    ta.value = 'typed note'
    ta.dispatchEvent(new Event('input', { bubbles: true }))
    expect(p.note).toBe('typed note')
    expect(save).toHaveBeenCalled()
  })

  it('closes the panel via closeNotePanel', () => {
    const p = fakePane('p1', '')
    openNotePanel('p1')
    expect(p.el.querySelector('.pane-note')).toBeTruthy()
    closeNotePanel('p1')
    expect(p.el.querySelector('.pane-note')).toBeNull()
  })

  it('closes the panel when the header × button is clicked', () => {
    const p = fakePane('p1', '')
    openNotePanel('p1')
    p.el.querySelector<HTMLButtonElement>('.pane-note-close')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    )
    expect(p.el.querySelector('.pane-note')).toBeNull()
  })
})
