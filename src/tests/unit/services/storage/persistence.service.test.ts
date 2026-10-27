// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { persistence, serializeLayout, recordCommand } from '@repositories/persistence.service'
import { settings, state, notifications, commandHistory, docs, panes, poppedOut } from '@views/state/state'
import { bookmarks, setBookmarks } from '@models/bookmark'
import type { LayoutNode, Pane } from '@views/types/types'

// persistence.service owns the renderer's serialize pipeline + debounced save.
// We capture writes by mocking the generic bridge `send` that storeService.save
// targets (window.crafterm.send('store:save', data)) and assert the serialized
// payload + debounce.

let saveState: ReturnType<typeof vi.fn>
beforeEach(() => {
  saveState = vi.fn()
  ;(window as unknown as { crafterm: { send: ReturnType<typeof vi.fn> } }).crafterm = {
    send: saveState
  } as never
  state.tree = []
  setBookmarks([])
  notifications.length = 0
  commandHistory.length = 0
  docs.clear()
})
afterEach(() => vi.useRealTimers())

describe('serialize / persist', () => {
  it('flush() serializes the live state into a SavedState and writes it', () => {
    setBookmarks([{ id: 'b1', type: 'link', title: 'T', content: 'c', tags: [], createdAt: 1 }])
    persistence.flush()
    expect(saveState).toHaveBeenCalledTimes(1)
    expect(saveState.mock.calls[0][0]).toBe('store:save') // channel
    const payload = saveState.mock.calls[0][1] // data is the send payload
    expect(payload.schemaVersion).toBe(4)
    expect(payload.tree).toEqual([])
    expect(payload.bookmarks).toEqual(bookmarks)
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

  it('serializeLayout persists a doc pane leaf with its path + absolute flag', () => {
    docs.set('d1', {
      id: 'd1',
      el: document.createElement('div'),
      relPath: '/repo/docs/plans/branch-plan.md',
      absolute: true
    })
    expect(serializeLayout({ type: 'leaf', paneId: 'd1' } as LayoutNode)).toEqual({
      type: 'leaf',
      docPane: { path: '/repo/docs/plans/branch-plan.md', absolute: true }
    })
  })

  describe('popped-out panes', () => {
    const bounds = { x: 100, y: 120, width: 720, height: 480 }
    const leafOf = (id: string): Record<string, unknown> =>
      serializeLayout({ type: 'leaf', paneId: id } as LayoutNode) as Record<string, unknown>

    afterEach(() => {
      panes.delete('p1')
      poppedOut.clear()
    })

    it('saves a popped-out pane with its pop-out window bounds', () => {
      panes.set('p1', { id: 'p1', stableId: 's1', popoutBounds: bounds } as unknown as Pane)
      poppedOut.add('p1')
      expect(leafOf('p1').popout).toEqual({ bounds })
    })

    it('saves a popped-out pane whose bounds are not reported yet without bounds', () => {
      panes.set('p1', { id: 'p1', stableId: 's1' } as unknown as Pane)
      poppedOut.add('p1')
      expect(leafOf('p1').popout).toEqual({})
    })

    it('does not mark a docked pane as popped out, even with remembered bounds', () => {
      panes.set('p1', { id: 'p1', stableId: 's1', popoutBounds: bounds } as unknown as Pane)
      expect(leafOf('p1')).not.toHaveProperty('popout')
    })
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
