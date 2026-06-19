// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { createTextarea } from '@ui/components/textarea/textarea'

describe('createTextarea', () => {
  it('defaults to an empty textarea', () => {
    const ta = createTextarea()
    expect(ta.tagName).toBe('TEXTAREA')
    expect(ta.value).toBe('')
    expect(ta.placeholder).toBe('')
  })

  it('applies value, placeholder, and rows', () => {
    const ta = createTextarea({ value: 'hello', placeholder: 'type…', rows: 4 })
    expect(ta.value).toBe('hello')
    expect(ta.placeholder).toBe('type…')
    expect(Number(ta.rows)).toBe(4)
  })
})
