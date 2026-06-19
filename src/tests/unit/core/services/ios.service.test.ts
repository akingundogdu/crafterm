import { describe, it, expect, vi, beforeEach } from 'vitest'

const runMock = vi.fn<(cmd: string, args: string[]) => Promise<string | null>>()
vi.mock('@core/services/exec', () => ({ run: (cmd: string, args: string[]) => runMock(cmd, args) }))

// execFile(cmd, args, opts, cb) — dispatch stdout per test via execImpl.
let execImpl: (cmd: string, args: string[]) => { err: Error | null; stdout: string }
const execFileMock = vi.fn(
  (cmd: string, args: string[], _opts: unknown, cb: (e: Error | null, out: string) => void) => {
    const { err, stdout } = execImpl(cmd, args)
    cb(err, stdout)
  }
)
vi.mock('child_process', () => ({ execFile: (...a: unknown[]) => (execFileMock as (...x: unknown[]) => void)(...a) }))

import * as ios from '@core/services/ios.service'

beforeEach(() => {
  runMock.mockReset()
  execFileMock.mockClear()
})

describe('ios.service.buildEnv', () => {
  it('maps set fields to IOSWT_* and joins copyFiles with ":"', () => {
    expect(
      ios.buildEnv(
        { project: 'App.xcworkspace', scheme: 'local', baseBundleId: 'com.x', copyFiles: ['a', 'b'] },
        '/repo'
      )
    ).toEqual({
      IOSWT_REPO_ROOT: '/repo',
      IOSWT_PROJECT: 'App.xcworkspace',
      IOSWT_SCHEME: 'local',
      IOSWT_BUNDLE_ID: 'com.x',
      IOSWT_COPY_FILES: 'a:b'
    })
  })
  it('omits empty fields and repoRoot when absent', () => {
    expect(ios.buildEnv(undefined)).toEqual({})
    expect(ios.buildEnv({ scheme: 'prod' })).toEqual({ IOSWT_SCHEME: 'prod' })
  })
})

describe('ios.service.listTargets', () => {
  it('parses simulators (iOS, available only) and physical devices, deduped', async () => {
    const simctl = JSON.stringify({
      devices: {
        'com.apple.CoreSimulator.SimRuntime.iOS-17-0': [
          { name: 'iPhone 15', udid: 'sim-1', isAvailable: true },
          { name: 'Old', udid: 'sim-2', isAvailable: false }
        ],
        'com.apple.CoreSimulator.SimRuntime.tvOS-17-0': [{ name: 'Apple TV', udid: 'tv-1' }]
      }
    })
    const xctrace = [
      '== Devices ==',
      'My Mac (00006000-0011)',
      "Akin's iPhone (17.0) (00008110-ABCDEF0123)",
      '== Simulators ==',
      'iPhone 15 (17.0) (sim-1)'
    ].join('\n')

    runMock.mockImplementation((_cmd, args) =>
      Promise.resolve(args.includes('simctl') ? simctl : args.includes('xctrace') ? xctrace : null)
    )

    const { simulators, devices } = await ios.listTargets()
    expect(simulators).toEqual([{ name: 'iPhone 15', udid: 'sim-1' }]) // unavailable + tvOS excluded
    expect(devices).toEqual([{ name: "Akin's iPhone (17.0)", udid: '00008110-ABCDEF0123' }]) // host mac excluded
  })

  it('returns empty lists when the tools are missing', async () => {
    runMock.mockResolvedValue(null)
    expect(await ios.listTargets()).toEqual({ simulators: [], devices: [] })
  })
})

describe('ios.service.listSchemes', () => {
  it('parses workspace schemes and selects -workspace for an .xcworkspace', async () => {
    execImpl = () => ({ err: null, stdout: JSON.stringify({ workspace: { schemes: ['local', 'prod'] } }) })
    const schemes = await ios.listSchemes('/repo', { project: 'App.xcworkspace' })
    expect(schemes).toEqual(['local', 'prod'])
    const args = execFileMock.mock.calls[0][1] as string[]
    expect(args).toContain('-workspace')
    expect(args).toContain('App.xcworkspace')
  })

  it('uses -project for a .xcodeproj and falls back to [] on error', async () => {
    execImpl = () => ({ err: null, stdout: JSON.stringify({ project: { schemes: ['Debug'] } }) })
    expect(await ios.listSchemes('/repo', { project: 'App.xcodeproj' })).toEqual(['Debug'])
    expect(execFileMock.mock.calls[0][1]).toContain('-project')

    execImpl = () => ({ err: new Error('xcodebuild failed'), stdout: '' })
    expect(await ios.listSchemes('/repo')).toEqual([])
  })
})
