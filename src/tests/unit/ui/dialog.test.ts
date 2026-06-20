// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest'
import { promptText, promptConfirm, promptForm } from '@ui/components/dialog/dialog'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('promptText', () => {
  it('resolves the trimmed value when confirmed via Enter', async () => {
    const p = promptText({ title: 'T', label: 'L' })
    const input = document.querySelector('.modal input') as HTMLInputElement
    input.value = '  hi  '
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(await p).toBe('hi')
    expect(document.querySelector('.modal-overlay')).toBeNull()
  })

  it('resolves null when confirmed empty', async () => {
    const p = promptText({ title: 'T', label: 'L' })
    ;(document.querySelector('.modal-actions .button-primary') as HTMLButtonElement).click()
    expect(await p).toBeNull()
  })

  it('resolves null on Escape', async () => {
    const p = promptText({ title: 'T', label: 'L', value: 'x' })
    const input = document.querySelector('.modal input') as HTMLInputElement
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(await p).toBeNull()
  })
})

describe('promptConfirm', () => {
  it('resolves true on confirm', async () => {
    const p = promptConfirm({ title: 'T', message: 'M' })
    ;(document.querySelector('.modal-actions .button-primary') as HTMLButtonElement).click()
    expect(await p).toBe(true)
  })

  it('resolves false on cancel (first action button)', async () => {
    const p = promptConfirm({ title: 'T', message: 'M' })
    ;(document.querySelector('.modal-actions button') as HTMLButtonElement).click()
    expect(await p).toBe(false)
  })
})

describe('promptForm', () => {
  it('requires the first field to be non-empty', async () => {
    const p = promptForm({ title: 'T', fields: [{ key: 'name', label: 'Name' }] })
    const ok = document.querySelector('.modal-actions .button-primary') as HTMLButtonElement
    ok.click() // first field empty → no-op, stays open
    expect(document.querySelector('.modal-overlay')).toBeTruthy()
    const input = document.querySelector('.modal input') as HTMLInputElement
    input.value = 'Acme'
    ok.click()
    expect(await p).toEqual({ name: 'Acme' })
  })
})
