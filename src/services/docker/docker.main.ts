import { handle } from '@services/channels.main'
import { dockerRun, parseJsonLines } from '@core/docker'
import type { DockerRow } from './docker.types'

// Docker tool bridge (docker:*): lists, inspect/logs, actions, prune. The CLI
// resolution + exec live in the @core/docker model; these thin handlers delegate.
export function registerDockerIpc(): void {
  // Is the docker CLI present and the daemon reachable?
  handle('docker:available', async () => {
    const r = await dockerRun(['version', '--format', '{{.Server.Version}}'], 4000)
    if (r.ok && r.out.trim()) return { ok: true, version: r.out.trim() }
    return { ok: false, error: (r.err || 'Docker is not running').trim() }
  })

  handle('docker:containers', async () => {
    const r = await dockerRun(['ps', '-a', '--no-trunc', '--format', '{{json .}}'])
    return r.ok ? parseJsonLines(r.out) : []
  })

  handle('docker:images', async () => {
    const r = await dockerRun(['images', '--format', '{{json .}}'])
    return r.ok ? parseJsonLines(r.out) : []
  })

  handle('docker:volumes', async () => {
    const r = await dockerRun(['volume', 'ls', '--format', '{{json .}}'])
    return r.ok ? parseJsonLines(r.out) : []
  })

  handle('docker:networks', async () => {
    const r = await dockerRun(['network', 'ls', '--format', '{{json .}}'])
    return r.ok ? parseJsonLines(r.out) : []
  })

  // Running compose projects (docker compose v2). ConfigFiles is used to target
  // `docker compose -f <file> …` actions.
  handle('docker:compose', async () => {
    const r = await dockerRun(['compose', 'ls', '--all', '--format', 'json'], 6000)
    if (!r.ok) return []
    try {
      const arr = JSON.parse(r.out.trim() || '[]')
      return Array.isArray(arr) ? (arr as DockerRow[]) : []
    } catch {
      return []
    }
  })

  // Live one-shot resource usage, keyed by container ID — merged into rows.
  handle('docker:stats', async () => {
    const r = await dockerRun(['stats', '--no-stream', '--format', '{{json .}}'], 12000)
    return r.ok ? parseJsonLines(r.out) : []
  })

  handle('docker:inspect', async ({ kind, id }) => {
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

  handle('docker:logs', async ({ id, tail }) => {
    const r = await dockerRun(['logs', '--tail', String(tail ?? 500), id], 8000)
    // docker logs writes app output to stderr too; return whichever has content.
    return r.out || r.err || ''
  })

  // Mutations: start/stop/restart/pause/unpause/remove a container, remove an
  // image/volume/network, or up/down/restart a compose project.
  handle('docker:action', async ({ kind, action, id, configFile }) => {
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
  })

  // System-wide cleanup. `images` also prunes unused images, not just dangling.
  handle('docker:prune', async ({ target }) => {
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
