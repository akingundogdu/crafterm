// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { persistence, serializeLayout, recordCommand } from './persistence.service'
import { settings, state, notifications, commandHistory } from '../../state'
import type { LayoutNode } from '../../types'

// persistence.service owns the renderer's serialize pipeline + debounced save.
// We capture writes by mocking the bridge channel storeService.save targets
// (window.crafterm.store.save) and assert the serialized payload + debounce.

let saveState: ReturnType<typeof vi.fn>
beforeEach(() => {
  saveState = vi.fn()
  ;(window as unknown as { crafterm: { store: Record<string, unknown> } }).crafterm = {
    store: { save: saveState }
  }
  state.tree = []
  settings.bookmarks = []
  notifications.length = 0
  commandHistory.length = 0
})
afterEach(() => vi.useRealTimers())

describe('serialize / persist', () => {
  it('flush() serializes the live state into a SavedState and writes it', () => {
    settings.bookmarks = [{ id: 'b1', type: 'link', title: 'T', content: 'c', tags: [], createdAt: 1 }]
    persistence.flush()
    expect(saveState).toHaveBeenCalledTimes(1)
    const payload = saveState.mock.calls[0][0]
    expect(payload.schemaVersion).toBe(4)
    expect(payload.tree).toEqual([])
    expect(payload.bookmarks).toEqual(settings.bookmarks)
  })

  it('serializeLayout maps a leaf with no live pane to a bare leaf, and recurses splits', () => {
    expect(serializeLayout({ type: 'leaf', paneId: 'x' } as LayoutNode)).toEqual({ type: 'leaf' })
    const split = serializeLayout({
      type: 'split',
      dir: 'row',
      sizes: [0.5, 0.5],
      children: [
        { type: 'leaf', paneId: 'a' },
        { type: 'leaf', paneId: 'b' }
      ]
    } as LayoutNode)
    expect(split.type).toBe('split')
    expect((split as { children: unknown[] }).children).toHaveLength(2)
  })
})

describe('debounced save()', () => {
  it('coalesces a burst into a single write after the debounce window', () => {
    vi.useFakeTimers()
    persistence.save()
    persistence.save()
    persistence.save()
    expect(saveState).not.toHaveBeenCalled() // nothing written synchronously
    vi.advanceTimersByTime(300)
    expect(saveState).toHaveBeenCalledTimes(1) // one coalesced write
  })

  it('flush() cancels a pending debounced save (no double write)', () => {
    vi.useFakeTimers()
    persistence.save()
    persistence.flush()
    expect(saveState).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(300)
    expect(saveState).toHaveBeenCalledTimes(1) // the scheduled one was cancelled
  })
})

describe('save status feed', () => {
  it('save() marks pending and notifies subscribers; persist clears it', () => {
    vi.useFakeTimers()
    const seen: boolean[] = []
    const unsub = persistence.subscribe(() => seen.push(persistence.status.pending))
    persistence.save()
    expect(persistence.status.pending).toBe(true)
    expect(seen).toContain(true)
    vi.advanceTimersByTime(300)
    expect(persistence.status.pending).toBe(false)
    expect(persistence.status.lastSavedAt).toBeGreaterThan(0)
    unsub()
  })
})

describe('recordCommand', () => {
  it('appends, skips immediate repeats, and ignores empty/oversized input', () => {
    recordCommand('ls')
    recordCommand('ls') // immediate repeat -> skipped
    recordCommand('  ') // empty -> ignored
    recordCommand('x'.repeat(501)) // too long -> ignored
    recordCommand('git status')
    expect(commandHistory).toEqual(['ls', 'git status'])
  })
})
