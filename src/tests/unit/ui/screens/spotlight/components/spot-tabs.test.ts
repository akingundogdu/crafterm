// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { createSpotTabs, TABS } from '@views/screens/spotlight/components/spot-tabs'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('createSpotTabs', () => {
  const make = (over: Partial<Parameters<typeof createSpotTabs>[0]> = {}) =>
    createSpotTabs({
      getActive: () => 'all',
      comboFor: () => null,
      onSelect: vi.fn(),
      ...over
    })

  it('renders one button per tab inside .spot-tabs', () => {
    const t = make()
    t.render()
    expect(t.el.className).toBe('spot-tabs')
    const btns = t.el.querySelectorAll('button.spot-tab')
    expect(btns).toHaveLength(TABS.length)
    expect(btns[0].querySelector('.spot-tab-name')?.textContent).toBe('All')
  })

  it('marks the active tab with .active', () => {
    const t = make({ getActive: () => 'files' })
    t.render()
    const active = t.el.querySelectorAll('.spot-tab.active')
    expect(active).toHaveLength(1)
    expect(active[0].querySelector('.spot-tab-name')?.textContent).toBe('Files')
  })

  it('renders a combo chip only when comboFor returns a label', () => {
    const t = make({ comboFor: (id) => (id === 'all' ? '⌘P' : null) })
    t.render()
    const chips = t.el.querySelectorAll('.spot-tab-combo')
    expect(chips).toHaveLength(1)
    expect(chips[0].textContent).toBe('⌘P')
  })

  it('clicking a tab fires onSelect with its id', () => {
    const onSelect = vi.fn()
    const t = make({ onSelect })
    t.render()
    t.el.querySelectorAll<HTMLButtonElement>('button.spot-tab')[2].click()
    expect(onSelect).toHaveBeenCalledWith(TABS[2].id)
  })

  it('re-render reflects a changed active tab', () => {
    let active = 'all'
    const t = make({ getActive: () => active })
    t.render()
    active = 'plans'
    t.render()
    expect(t.el.querySelector('.spot-tab.active .spot-tab-name')?.textContent).toBe('Plans')
  })
})
