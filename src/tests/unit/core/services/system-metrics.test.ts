import { describe, it, expect } from 'vitest'
import {
  cpuSample,
  cpuUsagePct,
  parseVmStat,
  parseSwapUsage,
  parseCpuTime,
  parsePsOutput,
  appIdentity,
  groupProcesses,
  topGroups
} from '@core/services/system-metrics/system-metrics.utils'

// The resource chip reads the machine through `vm_stat` / `sysctl` / `ps` text and
// two-sample deltas. These are the parsers behind it, exercised against real macOS
// output shapes.

const VM_STAT = `Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                                  1247519.
Pages active:                                2264608.
Pages inactive:                              2147308.
Pages speculative:                            116038.
Pages throttled:                                   0.
Pages wired down:                             350909.
Pages purgeable:                               46428.
"Translation faults":                     2966214504.
File-backed pages:                           1191399.
Anonymous pages:                             3336555.
Pages stored in compressor:                   488730.
Pages occupied by compressor:                 107983.
`

const PAGE = 16384
const TOTAL = 103079215104

describe('vm_stat memory parsing', () => {
  it('reports Activity Monitor figures: used = app + wired + compressed', () => {
    const memory = parseVmStat(VM_STAT, TOTAL)
    expect(memory).not.toBe(null)
    expect(memory!.appBytes).toBe((3336555 - 46428) * PAGE)
    expect(memory!.wiredBytes).toBe(350909 * PAGE)
    expect(memory!.compressedBytes).toBe(107983 * PAGE)
    expect(memory!.usedBytes).toBe(memory!.appBytes + memory!.wiredBytes + memory!.compressedBytes)
    expect(memory!.usedPct).toBeCloseTo((memory!.usedBytes / TOTAL) * 100, 5)
  })

  it('counts file-backed + purgeable pages as cache, outside the used total', () => {
    const memory = parseVmStat(VM_STAT, TOTAL)!
    expect(memory.cachedBytes).toBe((1191399 + 46428) * PAGE)
  })

  it('returns null for output that is not vm_stat', () => {
    expect(parseVmStat('command not found', TOTAL)).toBe(null)
    expect(parseVmStat(VM_STAT, 0)).toBe(null)
  })
})

describe('swap usage parsing', () => {
  it('reads used + total from sysctl vm.swapusage', () => {
    const swap = parseSwapUsage('total = 4096.00M  used = 2565.38M  free = 1530.62M  (encrypted)')
    expect(swap.totalBytes).toBe(Math.round(4096 * 1024 ** 2))
    expect(swap.usedBytes).toBe(Math.round(2565.38 * 1024 ** 2))
  })

  it('reports zero when swap is unavailable', () => {
    expect(parseSwapUsage('')).toEqual({ usedBytes: 0, totalBytes: 0 })
  })
})

describe('ps cpu time parsing', () => {
  it('reads [[DD-]HH:]MM:SS[.cc]', () => {
    expect(parseCpuTime('1:54.09')).toBeCloseTo(114.09, 2)
    expect(parseCpuTime('103:37.32')).toBeCloseTo(103 * 60 + 37.32, 2)
    expect(parseCpuTime('1:02:03')).toBe(3723)
    expect(parseCpuTime('2-03:04:05')).toBe(2 * 86400 + 3 * 3600 + 4 * 60 + 5)
  })

  it('degrades to 0 on unexpected text', () => {
    expect(parseCpuTime('-')).toBe(0)
  })
})

describe('ps row parsing', () => {
  const PS = [
    '22927   501 1240832   1:54.09 /Applications/Crafterm.app/Contents/MacOS/Crafterm',
    ' 1459   501 1001600 207:18.39 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '39460   501 871024   0:50.63 claude',
    '  866   308 814496  38:18.81 /System/Library/Frameworks/CoreServices.framework/Support/mds_stores',
    'garbage line'
  ].join('\n')

  it('keeps commands containing spaces intact and converts rss to bytes', () => {
    const rows = parsePsOutput(PS)
    expect(rows.length).toBe(4)
    expect(rows[1].command).toBe('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
    expect(rows[1].rssBytes).toBe(1001600 * 1024)
    expect(rows[1].uid).toBe(501)
    expect(rows[3].uid).toBe(308)
  })
})

describe('application identity', () => {
  it('groups helpers under the OUTERMOST .app bundle', () => {
    const helper = appIdentity(
      '/Applications/Google Chrome.app/Contents/Frameworks/Google Chrome Framework.framework/' +
        'Versions/151/Helpers/Google Chrome Helper (Renderer).app/Contents/MacOS/Google Chrome Helper (Renderer)'
    )
    expect(helper.key).toBe('/Applications/Google Chrome.app')
    expect(helper.name).toBe('Google Chrome')
  })

  it('groups plain binaries by name, so one tool never spans indistinguishable rows', () => {
    expect(appIdentity('claude')).toEqual({ key: 'claude', name: 'claude' })
    expect(appIdentity('/usr/libexec/diagnosticd').key).toBe(
      appIdentity('/Library/Developer/CoreSimulator/…/usr/libexec/diagnosticd').key
    )
    expect(appIdentity('/usr/libexec/mds_stores').name).toBe('mds_stores')
  })
})

describe('process grouping', () => {
  const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  const CHROME_HELPER =
    '/Applications/Google Chrome.app/Contents/Frameworks/Helpers/Google Chrome Helper.app/Contents/MacOS/Helper'
  const OWN = '/Applications/Crafterm.app/Contents/MacOS/Crafterm'

  const rows = [
    { pid: 1, uid: 501, rssBytes: 100, cpuSeconds: 30, command: CHROME },
    { pid: 2, uid: 501, rssBytes: 200, cpuSeconds: 12, command: CHROME_HELPER },
    { pid: 3, uid: 501, rssBytes: 50, cpuSeconds: 5, command: OWN },
    { pid: 4, uid: 0, rssBytes: 70, cpuSeconds: 1, command: '/usr/sbin/systemstats' }
  ]
  const ctx = { ownUid: 501, ownKey: '/Applications/Crafterm.app' }

  it('sums memory and CPU deltas across an application’s processes', () => {
    const previous = new Map([
      [1, 28],
      [2, 11]
    ])
    const groups = groupProcesses(rows, previous, 4, ctx)
    const chrome = groups.find((g) => g.name === 'Google Chrome')!
    expect(chrome.pids).toEqual([1, 2])
    expect(chrome.memoryBytes).toBe(300)
    // (30-28)/4 + (12-11)/4 = 75% of one core
    expect(chrome.cpuPct).toBeCloseTo(75, 5)
  })

  it('reports 0% for a process it has no previous sample for', () => {
    const groups = groupProcesses(rows, new Map(), 4, ctx)
    expect(groups.every((g) => g.cpuPct === 0)).toBe(true)
  })

  it('never offers to quit its own app or another user’s process', () => {
    const groups = groupProcesses(rows, new Map(), 4, ctx)
    const own = groups.find((g) => g.name === 'Crafterm')!
    expect(own.isOwn).toBe(true)
    expect(own.canQuit).toBe(false)
    expect(groups.find((g) => g.name === 'systemstats')!.canQuit).toBe(false)
    expect(groups.find((g) => g.name === 'Google Chrome')!.canQuit).toBe(true)
  })
})

describe('cpu sampling', () => {
  const core = (user: number, idle: number) => ({ times: { user, nice: 0, sys: 0, irq: 0, idle } })

  it('measures usage from the delta between two samples', () => {
    const previous = cpuSample([core(100, 900), core(100, 900)])
    const next = cpuSample([core(150, 1350), core(150, 1350)])
    expect(cpuUsagePct(previous, next)).toBeCloseTo(10, 5)
  })

  it('reports 0 without a previous sample instead of the since-boot average', () => {
    expect(cpuUsagePct(null, cpuSample([core(100, 900)]))).toBe(0)
  })
})

describe('top group selection', () => {
  it('keeps the heaviest of BOTH metrics so either sort order is honest', () => {
    const group = (key: string, cpuPct: number, memoryBytes: number) => ({
      key,
      name: key,
      pids: [1],
      cpuPct,
      memoryBytes,
      isOwn: false,
      canQuit: true
    })
    const top = topGroups([group('a', 90, 1), group('b', 1, 90), group('c', 2, 2)], 1)
    expect(top.map((g) => g.key).sort()).toEqual(['a', 'b'])
  })
})
