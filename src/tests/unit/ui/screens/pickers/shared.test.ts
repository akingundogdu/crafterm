// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { overlayModal, makeSearchInput } from '@ui/screens/pickers/shared'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('overlayModal', () => {
  it('mounts .modal-overlay > .modal with the extra class and a close button', () => {
    const { overlay, modal } = overlayModal('picker-modal')
    expect(document.body.contains(overlay)).toBe(true)
    expect(overlay.className).toBe('modal-overlay')
    expect(modal.className).toBe('modal picker-modal')
    expect(modal.querySelector('button')).toBeTruthy() // close button
  })

  it('close removes the overlay from the DOM', () => {
    const { close } = overlayModal()
    expect(document.querySelector('.modal-overlay')).toBeTruthy()
    close()
    expect(document.querySelector('.modal-overlay')).toBeNull()
  })

  it('backdrop mousedown closes, inner mousedown does not', () => {
    const { overlay, modal } = overlayModal()
    modal.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(document.querySelector('.modal-overlay')).toBeTruthy()
    overlay.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(document.querySelector('.modal-overlay')).toBeNull()
  })
})

describe('makeSearchInput', () => {
  it('builds a .search-box-input and fires onInput on input', () => {
    const fn = vi.fn()
    const input = makeSearchInput('Search…', fn)
    expect(input.className).toBe('search-box-input')
    expect(input.placeholder).toBe('Search…')
    expect(input.spellcheck).toBe(false)
    input.dispatchEvent(new Event('input'))
    expect(fn).toHaveBeenCalledOnce()
  })
})
