// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { createSelect, CREATE_OPTION } from './select'

describe('createSelect', () => {
  it('string options use the value as both value and label', () => {
    const sel = createSelect({ options: ['a', 'b'], value: 'b' })
    expect([...sel.options].map((o) => [o.value, o.textContent])).toEqual([
      ['a', 'a'],
      ['b', 'b']
    ])
    expect(sel.value).toBe('b')
  })

  it('value/label options keep a distinct stored value and display text', () => {
    const sel = createSelect({
      options: [
        { value: 'link', label: 'Link' },
        { value: 'code', label: 'Code' }
      ],
      value: 'code'
    })
    expect([...sel.options].map((o) => [o.value, o.textContent])).toEqual([
      ['link', 'Link'],
      ['code', 'Code']
    ])
    expect(sel.value).toBe('code')
  })

  it('mixes string and value/label options', () => {
    const sel = createSelect({ options: ['plain', { value: 'v', label: 'Display' }] })
    expect([...sel.options].map((o) => [o.value, o.textContent])).toEqual([
      ['plain', 'plain'],
      ['v', 'Display']
    ])
  })

  it('prepends an empty option and appends a create option', () => {
    const sel = createSelect({ options: ['x'], emptyLabel: 'None', allowCreate: true })
    const opts = [...sel.options]
    expect(opts[0].value).toBe('')
    expect(opts[0].textContent).toBe('None')
    expect(opts[opts.length - 1].value).toBe(CREATE_OPTION)
    expect(opts[opts.length - 1].textContent).toBe('+ New…')
  })
})
