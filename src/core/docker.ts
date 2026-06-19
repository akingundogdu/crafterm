import { ipcMain } from 'electron'
import { execFile } from 'child_process'
import { existsSync } from 'fs'

// Resolve the docker CLI: Docker Desktop / Colima install under these paths and
// GUI-launched apps don't inherit the user's shell PATH.
function dockerBin(): string {
  for (const p of ['/usr/local/bin/docker', '/opt/homebrew/bin/docker', '/usr/bin/docker']) {
    if (existsSync(p)) return p
  }
  return 'docker'
}

// Run docker with args; resolve { ok, out, err }. `timeout` guards slow calls
// (image pulls aside, the read commands here are quick; stats is the slowest).
function dockerRun(
  args: string[],
  timeout = 8000
): Promise<{ ok: boolean; out: string; err: string }> {
  return new Promise((resolve) => {
    execFile(dockerBin(), args, { timeout, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({ ok: !error, out: stdout ?? '', err: error ? stderr || error.message : '' })
    })
  })
}

// Parse `--format '{{json .}}'` output: one JSON object per non-empty line.
function parseJsonLines(out: string): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = []
  for (const line of out.split('\n')) {
    const t = line.trim()
    if (!t) continue
    try {
      rows.push(JSON.parse(t))
    } catch {
      // skip malformed line
    }
  }
  return rows
}

export function registerDockerIpc(): void {
  // Is the docker CLI present and the daemon reachable?
  ipcMain.handle('docker:available', async () => {
    const r = await dockerRun(['version', '--format', '{{.Server.Version}}'], 4000)
    if (r.ok && r.out.trim()) return { ok: true, version: r.out.trim() }
    return { ok: false, error: (r.err || 'Docker is not running').trim() }
  })

  ipcMain.handle('docker:containers', async () => {
    const r = await dockerRun(['ps', '-a', '--no-trunc', '--format', '{{json .}}'])
    return r.ok ? parseJsonLines(r.out) : []
  })

  ipcMain.handle('docker:images', async () => {
    const r = await dockerRun(['images', '--format', '{{json .}}'])
    return r.ok ? parseJsonLines(r.out) : []
  })

  ipcMain.handle('docker:volumes', async () => {
    const r = await dockerRun(['volume', 'ls', '--format', '{{json .}}'])
    return r.ok ? parseJsonLines(r.out) : []
  })

  ipcMain.handle('docker:networks', async () => {
    const r = await dockerRun(['network', 'ls', '--format', '{{json .}}'])
    return r.ok ? parseJsonLines(r.out) : []
  })

  // Running compose projects (docker compose v2). ConfigFiles is used to target
  // `docker compose -f <file> …` actions.
  ipcMain.handle('docker:compose', async () => {
    const r = await dockerRun(['compose', 'ls', '--all', '--format', 'json'], 6000)
    if (!r.ok) return []
    try {
      const arr = JSON.parse(r.out.trim() || '[]')
      return Array.isArray(arr) ? arr : []
    } catch {
      return []
    }
  })

  // Live one-shot resource usage, keyed by container ID — merged into rows.
  ipcMain.handle('docker:stats', async () => {
    const r = await dockerRun(['stats', '--no-stream', '--format', '{{json .}}'], 12000)
    return r.ok ? parseJsonLines(r.out) : []
  })

  ipcMain.handle('docker:inspect', async (_e, { kind, id }: { kind: string; id: string }) => {
    const cmd =
      kind === 'image'
        ? ['image', 'inspect', id]
        : kind === 'volume'
          ? ['volume', 'inspect', id]
          : kind === 'network'
            ? ['network', 'inspect', id]
            : ['inspect', id]
    const r = await dockerRun(cmd)
    return r.ok ? r.out : r.err || 'inspect failed'
  })

  ipcMain.handle(
    'docker:logs',
    async (_e, { id, tail }: { id: string; tail?: number }) => {
      const r = await dockerRun(['logs', '--tail', String(tail ?? 500), id], 8000)
      // docker logs writes app output to stderr too; return whichever has content.
      return r.out || r.err || ''
    }
  )

  // Mutations: start/stop/restart/pause/unpause/remove a container, remove an
  // image/volume/network, or up/down/restart a compose project.
  ipcMain.handle(
    'docker:action',
    async (
      _e,
      { kind, action, id, configFile }: { kind: string; action: string; id: string; configFile?: string }
    ): Promise<{ ok: boolean; error?: string }> => {
      let args: string[]
      if (kind === 'container') {
        if (action === 'remove') args = ['rm', '-f', id]
        else args = [action, id] // start | stop | restart | pause | unpause
      } else if (kind === 'image') {
        args = ['rmi', '-f', id]
      } else if (kind === 'volume') {
        args = ['volume', 'rm', '-f', id]
      } else if (kind === 'network') {
        args = ['network', 'rm', id]
      } else if (kind === 'compose' && configFile) {
        if (action === 'down') args = ['compose', '-f', configFile, 'down']
        else if (action === 'restart') args = ['compose', '-f', configFile, 'restart']
        else if (action === 'stop') args = ['compose', '-f', configFile, 'stop']
        else if (action === 'start') args = ['compose', '-f', configFile, 'start']
        else return { ok: false, error: 'unsupported compose action' }
      } else {
        return { ok: false, error: 'unsupported action' }
      }
      const r = await dockerRun(args, 30000)
      return r.ok ? { ok: true } : { ok: false, error: (r.err || 'action failed').trim() }
    }
  )

  // System-wide cleanup. `images` also prunes unused images, not just dangling.
  ipcMain.handle('docker:prune', async (_e, { target }: { target: string }) => {
    const args =
      target === 'images'
        ? ['image', 'prune', '-a', '-f']
        : target === 'volumes'
          ? ['volume', 'prune', '-f']
          : target === 'networks'
            ? ['network', 'prune', '-f']
            : ['container', 'prune', '-f']
    const r = await dockerRun(args, 30000)
    return r.ok ? { ok: true, out: r.out.trim() } : { ok: false, error: (r.err || 'prune failed').trim() }
  })
}
