import { execFile } from 'child_process'
import { run } from '../exec/exec.service'
import { BIN } from '../exec/exec.types'
import type { IosCfg, IosTarget } from './ios.types'

// Build the IOSWT_* env from a project's iosConfig (empty fields auto-detect in
// the script). repoRoot is the owning project's path.
export function buildEnv(cfg: IosCfg | undefined, repoRoot?: string): Record<string, string> {
  const e: Record<string, string> = {}
  if (repoRoot) e.IOSWT_REPO_ROOT = repoRoot
  if (cfg?.project) e.IOSWT_PROJECT = cfg.project
  if (cfg?.scheme) e.IOSWT_SCHEME = cfg.scheme
  if (cfg?.baseBundleId) e.IOSWT_BUNDLE_ID = cfg.baseBundleId
  if (cfg?.displayPrefix) e.IOSWT_DISPLAY_PREFIX = cfg.displayPrefix
  if (cfg?.defaultSimulator) e.IOSWT_SIMULATOR = cfg.defaultSimulator
  if (cfg?.worktreesDir) e.IOSWT_WORKTREES_DIR = cfg.worktreesDir
  if (cfg?.copyFiles?.length) e.IOSWT_COPY_FILES = cfg.copyFiles.join(':')
  return e
}

// Live status for the sidebar: enumerate a repo's worktrees and their variants'
// built/installed/running state. Resolves null on failure (renderer keeps prior).
export function report(scriptPath: string, repoRoot: string, cfg?: IosCfg): Promise<unknown> {
  return new Promise((resolve) => {
    execFile(
      '/bin/bash',
      [scriptPath, 'report'],
      { cwd: repoRoot, env: { ...process.env, ...buildEnv(cfg, repoRoot) }, timeout: 90_000, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return resolve(null)
        try {
          resolve(JSON.parse(stdout.toString()))
        } catch {
          resolve(null)
        }
      }
    )
  })
}

// Terminate a worktree's variant on the target simulator.
export function stop(scriptPath: string, worktreePath: string, cfg?: IosCfg): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(
      '/bin/bash',
      [scriptPath, 'stop'],
      { cwd: worktreePath, env: { ...process.env, ...buildEnv(cfg, worktreePath) }, timeout: 30_000 },
      (err) => resolve(!err)
    )
  })
}

// Enumerate available iOS run targets: simulators (simctl JSON, reliable) and
// connected physical devices (xctrace text, best-effort). Returns names + UDIDs
// for the worktree "Build & Run" picker.
export async function listTargets(): Promise<{ simulators: IosTarget[]; devices: IosTarget[] }> {
  const simulators: IosTarget[] = []
  const devices: IosTarget[] = []
  try {
    const out = await run(BIN.xcrun, ['simctl', 'list', 'devices', 'available', '--json'])
    if (out) {
      const data = JSON.parse(out) as { devices: Record<string, { name: string; udid: string; isAvailable?: boolean }[]> }
      for (const [runtime, list] of Object.entries(data.devices)) {
        if (!/iOS/i.test(runtime)) continue
        for (const d of list) {
          if (d.isAvailable === false) continue
          simulators.push({ name: d.name, udid: d.udid })
        }
      }
    }
  } catch {
    /* simctl missing / parse error — leave simulators empty */
  }
  try {
    const out = await run(BIN.xcrun, ['xctrace', 'list', 'devices'])
    if (out) {
      // Physical devices live under "== Devices ==" AND "== Devices Offline =="
      // (a USB device is often listed "offline" until trusted/tunneled — still
      // worth showing so the user can pick it). Lines look like
      // "Jane's iPhone (17.0) (00008110-...)". The host Mac carries no OS version
      // in parens, so the version-requiring regex excludes it; simulators live
      // under their own header.
      let inDevices = false
      for (const line of out.split('\n')) {
        const t = line.trim()
        if (/^==.*Devices.*==/i.test(t)) { inDevices = true; continue }
        if (/^==/.test(t)) { inDevices = false; continue }
        if (!inDevices || !t || /Simulator/i.test(t)) continue
        const m = t.match(/^(.*?)\s+\(([\d.]+)\)\s+\(([0-9A-Fa-f-]{8,})\)$/)
        if (m && !devices.some((d) => d.udid === m![3])) {
          devices.push({ name: `${m[1]} (${m[2]})`, udid: m[3] })
        }
      }
    }
  } catch {
    /* xctrace missing — leave devices empty */
  }
  return { simulators, devices }
}

// List the Xcode schemes for an iOS project (e.g. "local" / "prod" — they pick
// the API environment). Used by the worktree "Build & Run" picker's scheme level.
export function listSchemes(repoRoot: string, cfg?: IosCfg): Promise<string[]> {
  return new Promise<string[]>((resolve) => {
    const args = ['xcodebuild', '-list', '-json']
    const container = cfg?.project?.trim()
    if (container) args.push(/\.xcworkspace$/.test(container) ? '-workspace' : '-project', container)
    execFile(
      BIN.xcrun,
      args,
      { cwd: repoRoot, timeout: 30_000, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return resolve([])
        try {
          const d = JSON.parse(stdout.toString())
          const schemes = (d.workspace || d.project || {}).schemes
          resolve(Array.isArray(schemes) ? schemes : [])
        } catch {
          resolve([])
        }
      }
    )
  })
}

// ---- Simulator maintenance (todomqz3j1009t) ---------------------------------

// Run one xcrun command, carrying its stderr back so the UI can say what failed.
function xcrun(args: string[]): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    execFile(BIN.xcrun, args, { timeout: 120_000 }, (err, _out, stderr) => {
      if (!err) return resolve({ ok: true })
      resolve({ ok: false, error: (stderr || err.message).toString().trim() })
    })
  })
}

// Shut down one simulator, or every booted one when no udid is given.
export function simShutdown(udid?: string): Promise<{ ok: boolean; error?: string }> {
  return xcrun(['simctl', 'shutdown', udid || 'all'])
}

// Erase one simulator (or all of them) back to a clean state. simctl refuses to
// erase a booted device, so shut it down first — that is what the command means in
// practice, and it matches what people type by hand.
export async function simErase(udid?: string): Promise<{ ok: boolean; error?: string }> {
  await simShutdown(udid)
  return xcrun(['simctl', 'erase', udid || 'all'])
}

// Remove an installed app from a simulator or a physical device.
export function appUninstall(
  udid: string,
  bundleId: string,
  kind: 'simulator' | 'device'
): Promise<{ ok: boolean; error?: string }> {
  return kind === 'simulator'
    ? xcrun(['simctl', 'uninstall', udid, bundleId])
    : xcrun(['devicectl', 'device', 'uninstall', 'app', '--device', udid, bundleId])
}
