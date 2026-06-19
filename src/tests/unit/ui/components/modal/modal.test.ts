// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { createButton } from '@ui/components/button/button'
import { createModal } from '@ui/components/modal/modal'
import { createField } from '@ui/components/field/field'
import { createInput } from '@ui/components/input/input'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('createButton', () => {
  it('primary variant adds .button-primary and sets text', () => {
    const b = createButton({ text: 'OK', variant: 'primary' })
    expect(b.className).toBe('button-primary')
    expect(b.textContent).toBe('OK')
  })
  it('plain button has no class and no explicit type', () => {
    const b = createButton({ text: 'Cancel' })
    expect(b.className).toBe('')
    expect(b.getAttribute('type')).toBeNull()
  })
  it('fires onClick', () => {
    const fn = vi.fn()
    createButton({ text: 'x', onClick: fn }).click()
    expect(fn).toHaveBeenCalledOnce()
  })
})

describe('createModal', () => {
  it('builds overlay > modal.modal-prompt with h2 first and actions last', () => {
    const m = createModal({ title: 'T' })
    m.append(createField('Label', createInput({})))
    m.mount()
    const overlay = document.querySelector('.modal-overlay')
    expect(overlay).toBeTruthy()
    const modal = overlay!.querySelector('.modal.modal-prompt')!
    const kids = [...modal.children]
    expect(kids[0].tagName).toBe('H2')
    expect(kids[1].className).toBe('field')
    expect(kids[kids.length - 1].className).toBe('modal-actions')
  })
  it('appends an extra className onto .modal', () => {
    const m = createModal({ title: 'T', className: 'close-actions-modal' })
    expect(m.modal.className).toBe('modal modal-prompt close-actions-modal')
  })
  it('orders actions as cancel then primary confirm', () => {
    const m = createModal({ title: 'T', confirmText: 'Go', cancelText: 'No' })
    const btns = m.actions.querySelectorAll('button')
    expect(btns[0].textContent).toBe('No')
    expect(btns[1].className).toBe('button-primary')
    expect(btns[1].textContent).toBe('Go')
  })
  it('close removes overlay and fires onClose exactly once', () => {
    const m = createModal({ title: 'T' })
    m.mount()
    const cb = vi.fn()
    m.onClose(cb)
    m.close()
    m.close()
    expect(document.querySelector('.modal-overlay')).toBeNull()
    expect(cb).toHaveBeenCalledOnce()
  })
  it('backdrop mousedown closes', () => {
    const m = createModal({ title: 'T' })
    m.mount()
    const cb = vi.fn()
    m.onClose(cb)
    m.overlay.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(cb).toHaveBeenCalledOnce()
  })
})
