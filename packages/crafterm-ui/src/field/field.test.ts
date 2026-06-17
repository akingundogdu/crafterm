// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { createField } from './field'
import { createInput } from '../input/input'

describe('createField', () => {
  it('wraps a control in .field with a <label>', () => {
    const input = createInput()
    const field = createField('Title', input)
    expect(field.className).toBe('field')
    const label = field.querySelector('label')!
    expect(label.textContent).toBe('Title')
    expect(field.querySelector('input')).toBe(input)
    // no hint span unless requested
    expect(field.querySelector('.field-hint')).toBeNull()
  })

  it('appends a .field-hint span inside the label when hint is given', () => {
    const field = createField('Attendees', createInput(), { hint: '(comma separated)' })
    const hint = field.querySelector('label .field-hint')!
    expect(hint.textContent).toBe('(comma separated)')
    // the label keeps its main text alongside the hint
    expect(field.querySelector('label')!.textContent).toContain('Attendees')
  })
})
