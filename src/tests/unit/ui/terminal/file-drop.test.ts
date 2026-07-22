import { describe, it, expect, beforeEach, vi } from 'vitest'

const panes = new Map<string, { term: { focus: () => void } }>()
const input = vi.fn()
const pathForFile = vi.fn((f: { name: string }) => `/abs/${f.name}`)

vi.mock('@views/state/spine', () => ({
  get panes() {
    return panes
  },
  opened: new Set(),
  settings: { font: { family: 'mono', size: 12 } },
  resolveTheme: () => ({}),
  paneActions: {},
  state: { tree: [] }
}))
vi.mock('@repositories/persistence.service', () => ({
  persistence: { save: () => {} },
  recordCommand: () => {}
}))
vi.mock('@services', () => ({ terminalService: { input }, pathForFile }))
vi.mock('@views/pane/pane', () => ({ showPaneMenu: () => {} }))

const { formatDroppedPaths, makeFileDrop } = await import('@views/terminal/terminal.store')

function drag(types: string[], files: Array<{ name: string }> = []): DragEvent {
  return {
    dataTransfer: { types, files, dropEffect: '' },
    preventDefault: vi.fn()
  } as unknown as DragEvent
}

describe('formatDroppedPaths', () => {
  it('escapes spaces and shell-special chars, adds a trailing space', () => {
    expect(formatDroppedPaths(['/a/foo bar.txt'])).toBe('/a/foo\\ bar.txt ')
    expect(formatDroppedPaths(['/a/(x)&y.txt'])).toBe('/a/\\(x\\)\\&y.txt ')
  })

  it('space-joins multiple paths', () => {
    expect(formatDroppedPaths(['/a/one', '/b/two'])).toBe('/a/one /b/two ')
  })

  it('drops empty entries and returns empty when nothing usable', () => {
    expect(formatDroppedPaths([''])).toBe('')
    expect(formatDroppedPaths([])).toBe('')
    expect(formatDroppedPaths(['', '/a/x'])).toBe('/a/x ')
  })
})

describe('makeFileDrop', () => {
  beforeEach(() => {
    input.mockClear()
    pathForFile.mockClear()
    panes.clear()
  })

  it('onDragOver preventDefault + copy only for OS file drags', () => {
    const { onDragOver } = makeFileDrop('p1')

    const fileDrag = drag(['Files'])
    onDragOver(fileDrag)
    expect(fileDrag.preventDefault).toHaveBeenCalled()
    expect(fileDrag.dataTransfer!.dropEffect).toBe('copy')

    const internalDrag = drag(['text/plain'])
    onDragOver(internalDrag)
    expect(internalDrag.preventDefault).not.toHaveBeenCalled()
  })

  it('onDrop resolves paths, writes to the pty, and focuses the pane', () => {
    const focus = vi.fn()
    panes.set('p1', { term: { focus } })
    const { onDrop } = makeFileDrop('p1')

    const e = drag(['Files'], [{ name: 'a b.txt' }, { name: 'c.txt' }])
    onDrop(e)

    expect(e.preventDefault).toHaveBeenCalled()
    expect(input).toHaveBeenCalledWith('p1', '/abs/a\\ b.txt /abs/c.txt ')
    expect(focus).toHaveBeenCalled()
  })

  it('onDrop is a no-op when no files are present', () => {
    const { onDrop } = makeFileDrop('p1')
    onDrop(drag(['Files'], []))
    expect(input).not.toHaveBeenCalled()
  })
})
