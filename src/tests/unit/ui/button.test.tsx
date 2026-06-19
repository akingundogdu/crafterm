// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { createButton } from '@ui/components/button/button'

describe('createButton (JSX)', () => {
  it('renders a <button> with text', () => {
    const btn = createButton({ text: 'Save' })
    expect(btn.tagName).toBe('BUTTON')
    expect(btn.textContent).toBe('Save')
  })

  it('combines variant and className', () => {
    const btn = createButton({ variant: 'primary', className: 'diff-hbtn' })
    expect(btn.className).toBe('button-primary diff-hbtn')
  })

  it('omits class when no variant/className given', () => {
    const btn = createButton({ text: 'x' })
    expect(btn.getAttribute('class')).toBeNull()
  })

  it('wires onClick', () => {
    const onClick = vi.fn()
    const btn = createButton({ text: 'Go', onClick })
    btn.click()
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('sets type, title and aria-label when provided', () => {
    const btn = createButton({ type: 'submit', title: 'T', ariaLabel: 'A' })
    expect(btn.type).toBe('submit')
    expect(btn.title).toBe('T')
    expect(btn.getAttribute('aria-label')).toBe('A')
  })

  it('leaves type at the native default when unset', () => {
    const btn = createButton({ text: 'x' })
    expect(btn.getAttribute('type')).toBeNull()
  })
})
