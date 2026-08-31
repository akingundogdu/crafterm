// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { DailyPlanTag } from '@views/types/types'

const tags: DailyPlanTag[] = []

vi.mock('@views/state/spine', () => ({ state: { tree: [] } }))
vi.mock('@views/lib/uid', () => ({ uid: (prefix: string) => `${prefix}-1` }))
vi.mock('@repositories', () => ({
  dailyTaskRepo: { upsert: () => {} },
  dailyTagRepo: { getAll: () => tags }
}))
vi.mock('@views/catalog/catalog', () => ({ projectTree: () => [], findProjectById: () => null }))
vi.mock('@views/screens/daily-plan/daily-plan.store', () => ({ todayKey: () => '2026-07-20', nextOrder: () => 0 }))
vi.mock('@views/screens/daily-plan/daily-plan.entry', () => ({ openTaskInTerminal: () => {} }))
vi.mock('@views/components/dialog/confirm', () => ({ promptConfirm: () => Promise.resolve(true) }))
vi.mock('@services', () => ({
  gitService: { branchesAt: () => Promise.resolve([]) },
  fsService: { writePastedImage: () => Promise.resolve(null) }
}))
vi.mock('@views/commands/commands', () => ({ newTab: () => {} }))
vi.mock('@views/screens/spotlight/spotlight', () => ({ showSpotlight: () => {} }))

const { default: store, labelsButtonText, labelsButtonTitle, LABELS_EMPTY_HINT } = await import(
  '@views/screens/content/components/composer-labels.store'
)
const { default: composerStore } = await import('@views/screens/content/components/agent-composer.store')

describe('the composer Labels dropdown', () => {
  beforeEach(async () => {
    tags.length = 0
    composerStore.clearLabels()
    store.close()
  })

  it('captions the button with the placeholder, the single name, then a count', () => {
    expect(labelsButtonText([])).toBe('Labels')
    expect(labelsButtonText(['urgent'])).toBe('urgent')
    expect(labelsButtonText(['urgent', 'design'])).toBe('2 labels')
  })

  it('spells the full selection out in the title, and hints when there is none', () => {
    expect(labelsButtonTitle(['urgent', 'design'])).toBe('urgent, design')
    expect(labelsButtonTitle([])).toBe(LABELS_EMPTY_HINT)
  })

  it('reads the labels and the selection off the composer store', async () => {
    tags.push({ id: 't1', name: 'urgent', color: '#f00' }, { id: 't2', name: 'design', color: '#0f0' })
    await composerStore.refresh()

    store.toggleLabel('t1')

    expect(store.labels.map((t) => t.name)).toEqual(['urgent', 'design'])
    expect(store.isOn('t1')).toBe(true)
    expect(store.isOn('t2')).toBe(false)
    expect(store.selectedNames).toEqual(['urgent'])
    expect(composerStore.labelIds).toEqual(['t1'])
  })

  it('opens and closes, and a click outside it closes it', () => {
    store.toggleOpen()
    expect(store.isOpen).toBe(true)

    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(store.isOpen).toBe(false)
  })

  it('keeps the menu open while clicking inside it', () => {
    const host = document.createElement('div')
    host.className = 'composer-labels'
    const row = document.createElement('button')
    host.appendChild(row)
    document.body.appendChild(host)

    store.open()
    row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(store.isOpen).toBe(true)

    store.close()
    host.remove()
  })

  it('closes on Escape', () => {
    store.open()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(store.isOpen).toBe(false)
  })
})
