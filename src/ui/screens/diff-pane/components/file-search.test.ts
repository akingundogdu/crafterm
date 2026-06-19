// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { createFileSearch } from './file-search'
import type { FileDiff } from '../parse-diff'

afterEach(() => {
  document.body.innerHTML = ''
})

const files: FileDiff[] = [
  { path: 'src/alpha.ts', rows: [] },
  { path: 'src/beta.ts', rows: [] },
  { path: 'docs/readme.md', rows: [] }
]

const mount = (onPick = vi.fn(), activeIdx = 0) => {
  const handle = createFileSearch({
    getFiles: () => files,
    getActiveIdx: () => activeIdx,
    onPick
  })
  document.body.appendChild(handle.el)
  const input = handle.el.querySelector<HTMLInputElement>('.diff-search-input')!
  return { handle, onPick, input }
}
const items = (el: HTMLElement) => [...el.querySelectorAll('.diff-search-item')]
const mouse = (el: Element, type: string) =>
  el.dispatchEvent(new MouseEvent(type, { bubbles: true }))
const key = (el: Element, k: string) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))

describe('createFileSearch', () => {
  it('starts hidden and toggles open/closed', () => {
    const { handle } = mount()
    expect(handle.isOpen()).toBe(false)
    handle.toggle()
    expect(handle.isOpen()).toBe(true)
    handle.toggle()
    expect(handle.isOpen()).toBe(false)
  })

  it('lists every file when the query is empty and marks the active one', () => {
    const { handle } = mount(vi.fn(), 1)
    handle.open()
    const rows = items(handle.el)
    expect(rows.map((r) => r.textContent)).toEqual(['src/alpha.ts', 'src/beta.ts', 'docs/readme.md'])
    expect(rows[1].classList.contains('active')).toBe(true)
  })

  it('filters by a path substring', () => {
    const { handle, input } = mount()
    handle.open()
    input.value = 'beta'
    input.dispatchEvent(new Event('input'))
    expect(items(handle.el).map((r) => r.textContent)).toEqual(['src/beta.ts'])
  })

  it('shows an empty hint when nothing matches', () => {
    const { handle, input } = mount()
    handle.open()
    input.value = 'zzz'
    input.dispatchEvent(new Event('input'))
    expect(items(handle.el)).toHaveLength(0)
    expect(handle.el.querySelector('.diff-search-empty')?.textContent).toBe('No matching files')
  })

  it('picks a file on mousedown and closes', () => {
    const { handle, onPick } = mount()
    handle.open()
    mouse(items(handle.el)[2], 'mousedown')
    expect(onPick).toHaveBeenCalledWith(2)
    expect(handle.isOpen()).toBe(false)
  })

  it('Enter jumps to the first match and closes', () => {
    const { handle, onPick, input } = mount()
    handle.open()
    input.value = 'beta'
    input.dispatchEvent(new Event('input'))
    key(input, 'Enter')
    expect(onPick).toHaveBeenCalledWith(1)
    expect(handle.isOpen()).toBe(false)
  })

  it('Escape closes without picking', () => {
    const { handle, onPick, input } = mount()
    handle.open()
    key(input, 'Escape')
    expect(handle.isOpen()).toBe(false)
    expect(onPick).not.toHaveBeenCalled()
  })
})
