// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import store, { formatBytes, formatPct, levelOf, TOP_ROWS } from '@views/components/status-bar/components/resource-chip.store'
import { metersFor, breakdownFor } from '@views/components/status-bar/components/resource-popover.store'
import { actionsFor, formatRowCpu } from '@views/components/status-bar/components/resource-process-row.store'
import ResourcePopover from '@views/components/status-bar/components/resource-popover'
import type { SystemMetrics, ProcessGroup } from '@services/system/system.types'

const GB = 1024 ** 3

function metrics(over: Partial<SystemMetrics['memory']> = {}, cpuPct = 42): SystemMetrics {
  return {
    cpu: { usagePct: cpuPct, coreCount: 12, loadAvg1: 2.5 },
    memory: {
      totalBytes: 96 * GB,
      usedBytes: 60 * GB,
      usedPct: 62.5,
      appBytes: 50 * GB,
      wiredBytes: 6 * GB,
      compressedBytes: 4 * GB,
      cachedBytes: 19 * GB,
      swapUsedBytes: 0,
      swapTotalBytes: 4 * GB,
      ...over
    },
    sampledAt: Date.now()
  }
}

function group(over: Partial<ProcessGroup> = {}): ProcessGroup {
  return {
    key: '/Applications/Google Chrome.app',
    name: 'Google Chrome',
    pids: [1, 2],
    cpuPct: 32.5,
    memoryBytes: 4 * GB,
    isOwn: false,
    canQuit: true,
    ...over
  }
}

// gea renders a store-reading component asynchronously — wait a macrotask before
// asserting on the DOM.
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  store.metrics = null
  store.groups = []
  store.sortBy = 'cpu'
  store.isOpen = false
  store.error = ''
  store.busyKey = null
})

describe('resource formatting', () => {
  it('formats byte sizes and percentages compactly', () => {
    expect(formatBytes(12.4 * GB)).toBe('12.4 GB')
    expect(formatBytes(820 * 1024 ** 2)).toBe('820 MB')
    expect(formatPct(62.5)).toBe('63%')
  })

  it('escalates the severity level with usage', () => {
    expect(levelOf(40)).toBe('')
    expect(levelOf(80)).toBe('warn')
    expect(levelOf(95)).toBe('high')
  })

  it('keeps a decimal on quiet processes so they do not all read 0%', () => {
    expect(formatRowCpu(0.4)).toBe('0.4%')
    expect(formatRowCpu(37.6)).toBe('38%')
  })
})

describe('popover view models', () => {
  it('builds CPU + memory meters, and swap only when swap is in use', () => {
    expect(metersFor(metrics()).map((m) => m.key)).toEqual(['cpu', 'memory'])
    expect(metersFor(metrics({ swapUsedBytes: 2 * GB })).map((m) => m.key)).toEqual([
      'cpu',
      'memory',
      'swap'
    ])
  })

  it('has no meters or breakdown before the first reading lands', () => {
    expect(metersFor(null)).toEqual([])
    expect(breakdownFor(null)).toEqual([])
  })

  it('lists the Activity Monitor memory split', () => {
    const rows = breakdownFor(metrics())
    expect(rows.map((r) => r.value)).toEqual(['50.0 GB', '6.0 GB', '4.0 GB', '19.0 GB'])
  })
})

describe('process row actions', () => {
  it('offers quit + force quit for another user-owned application', () => {
    expect(actionsFor(group()).map((a) => a.key)).toEqual(['quit', 'force'])
  })

  it('offers nothing for this app or a process it cannot signal', () => {
    expect(actionsFor(group({ isOwn: true, canQuit: false }))).toEqual([])
    expect(actionsFor(group({ canQuit: false }))).toEqual([])
  })
})

describe('row ordering', () => {
  const groups = [
    group({ key: 'a', name: 'A', cpuPct: 5, memoryBytes: 9 * GB }),
    group({ key: 'b', name: 'B', cpuPct: 90, memoryBytes: 1 * GB }),
    group({ key: 'c', name: 'C', cpuPct: 50, memoryBytes: 3 * GB })
  ]

  it('sorts by the active metric', () => {
    store.groups = groups
    expect(store.rows.map((r) => r.key)).toEqual(['b', 'c', 'a'])
    store.sortBy = 'memory'
    expect(store.rows.map((r) => r.key)).toEqual(['a', 'c', 'b'])
  })

  it('caps the list at TOP_ROWS', () => {
    store.groups = Array.from({ length: 20 }, (_, i) =>
      group({ key: `k${i}`, name: `K${i}`, cpuPct: i })
    )
    expect(store.rows.length).toBe(TOP_ROWS)
    expect(store.rows[0].key).toBe('k19')
  })
})

describe('resource popover rendering', () => {
  it('renders one bar per meter and one row per application', async () => {
    store.metrics = metrics({ swapUsedBytes: 2 * GB })
    store.groups = [group(), group({ key: 'x', name: 'Xcode', cpuPct: 8, memoryBytes: GB })]
    store.isOpen = true

    const host = document.createElement('div')
    new ResourcePopover().render(host)
    await settle()

    expect(host.querySelectorAll('.resource-popover-meter').length).toBe(3)
    expect(host.querySelectorAll('.resource-popover-breakdown-row').length).toBe(4)
    const rows = host.querySelectorAll('.resource-process-row')
    expect(rows.length).toBe(2)
    expect(rows[0].querySelector('.resource-process-row-name')?.textContent).toBe('Google Chrome')
    expect(host.querySelector<HTMLElement>('.resource-popover-bar-fill')?.style.width).toBe('42%')
  })

  it('stays mounted but hidden while closed, so its keyed list can materialize', async () => {
    store.metrics = metrics()
    store.groups = [group()]
    const host = document.createElement('div')
    new ResourcePopover().render(host)
    await settle()

    const pop = host.querySelector<HTMLElement>('.resource-popover')
    expect(pop).not.toBe(null)
    expect(pop!.style.display).toBe('none')
  })

  it('shows a placeholder until the first process listing arrives', async () => {
    store.metrics = metrics()
    store.isOpen = true
    const host = document.createElement('div')
    new ResourcePopover().render(host)
    await settle()

    expect(host.querySelector('.resource-popover-empty')).not.toBe(null)
    expect(host.querySelectorAll('.resource-process-row').length).toBe(0)
  })
})
