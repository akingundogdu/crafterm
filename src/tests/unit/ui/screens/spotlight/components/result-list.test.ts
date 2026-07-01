// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { createResultList, type SpotEntry } from '@views/screens/spotlight/components/result-list'

afterEach(() => {
  document.body.innerHTML = ''
})

const entry = (label: string, over: Partial<SpotEntry> = {}): SpotEntry => ({
  source: 'file',
  label,
  run: vi.fn(),
  ...over
})

const make = (onChoose = vi.fn()) =>
  createResultList({ onChoose, badgeFor: (s) => s.toUpperCase() })

describe('createResultList', () => {
  it('renders a row per item with label + detail', () => {
    const list = make()
    list.setItems([entry('alpha', { detail: 'one' }), entry('beta')], false)
    const rows = list.el.querySelectorAll('.spot-row')
    expect(rows).toHaveLength(2)
    expect(rows[0].querySelector('.spotlight-label')?.textContent).toBe('alpha')
    expect(rows[0].querySelector('.spotlight-detail')?.textContent).toBe('one')
    expect(rows[1].querySelector('.spotlight-detail')).toBeNull()
  })

  it('shows a source badge only when showBadge is true', () => {
    const list = make()
    list.setItems([entry('x', { source: 'command' })], true)
    const badge = list.el.querySelector('.spotlight-source-badge')
    expect(badge?.textContent).toBe('COMMAND')
    expect(badge?.classList.contains('gs-command')).toBe(true)
    list.setItems([entry('x', { source: 'command' })], false)
    expect(list.el.querySelector('.spotlight-source-badge')).toBeNull()
  })

  it('renders an empty hint when there are no items', () => {
    const list = make()
    list.setItems([], true)
    expect(list.el.querySelector('.spot-row')).toBeNull()
    expect(list.el.querySelector('.empty-hint')?.textContent).toBe('No matches')
  })

  it('setLoading clears rows and shows a loading hint', () => {
    const list = make()
    list.setItems([entry('a')], false)
    list.setLoading()
    expect(list.el.querySelector('.spot-row')).toBeNull()
    expect(list.el.querySelector('.empty-hint')?.textContent).toBe('Loading…')
  })

  it('selects the first item after setItems', () => {
    const list = make()
    const items = [entry('a'), entry('b')]
    list.setItems(items, false)
    expect(list.selected()).toBe(items[0])
    expect(list.el.querySelectorAll('.spot-row')[0].classList.contains('active')).toBe(true)
  })

  it('move shifts selection and clamps at both ends', () => {
    const list = make()
    const items = [entry('a'), entry('b'), entry('c')]
    list.setItems(items, false)
    list.move(1)
    expect(list.selected()).toBe(items[1])
    expect(list.el.querySelectorAll('.spot-row')[1].classList.contains('active')).toBe(true)
    list.move(10)
    expect(list.selected()).toBe(items[2])
    list.move(-99)
    expect(list.selected()).toBe(items[0])
  })

  it('clicking a row fires onChoose with that entry', () => {
    const onChoose = vi.fn()
    const list = make(onChoose)
    const items = [entry('a'), entry('b')]
    list.setItems(items, false)
    list.el.querySelectorAll<HTMLButtonElement>('.spot-row')[1].click()
    expect(onChoose).toHaveBeenCalledWith(items[1])
  })

  it('mouseenter updates the selection', () => {
    const list = make()
    const items = [entry('a'), entry('b')]
    list.setItems(items, false)
    list.el
      .querySelectorAll('.spot-row')[1]
      .dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    expect(list.selected()).toBe(items[1])
  })
})
