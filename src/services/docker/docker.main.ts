import { handle, Channel } from '@services/channels.main'
import { dockerRun, parseJsonLines } from '@core/docker'
import { DockerCli, type DockerRow } from './docker.types'

// Docker tool bridge (docker:*): lists, inspect/logs, actions, prune. The CLI
// resolution + exec live in the @core/docker model; these thin handlers delegate.
export function registerDockerIpc(): void {
  // Is the docker CLI present and the daemon reachable?
  handle(Channel.Docker.Available, async () => {
    const r = await dockerRun([DockerCli.Sub.Version, DockerCli.Flag.Format, DockerCli.Format.ServerVersion], 4000)
    if (r.ok && r.out.trim()) return { ok: true, version: r.out.trim() }
    return { ok: false, error: (r.err || 'Docker is not running').trim() }
  })

  handle(Channel.Docker.Containers, async () => {
    const r = await dockerRun([DockerCli.Sub.Ps, DockerCli.Flag.AllShort, DockerCli.Flag.NoTrunc, DockerCli.Flag.Format, DockerCli.Format.Json])
    return r.ok ? parseJsonLines(r.out) : []
  })

  handle(Channel.Docker.Images, async () => {
    const r = await dockerRun([DockerCli.Sub.Images, DockerCli.Flag.Format, DockerCli.Format.Json])
    return r.ok ? parseJsonLines(r.out) : []
  })

  handle(Channel.Docker.Volumes, async () => {
    const r = await dockerRun([DockerCli.Sub.Volume, DockerCli.Sub.Ls, DockerCli.Flag.Format, DockerCli.Format.Json])
    return r.ok ? parseJsonLines(r.out) : []
  })

  handle(Channel.Docker.Networks, async () => {
    const r = await dockerRun([DockerCli.Sub.Network, DockerCli.Sub.Ls, DockerCli.Flag.Format, DockerCli.Format.Json])
    return r.ok ? parseJsonLines(r.out) : []
  })

  // Running compose projects (docker compose v2). ConfigFiles is used to target
  // `docker compose -f <file> …` actions.
  handle(Channel.Docker.Compose, async () => {
    const r = await dockerRun([DockerCli.Sub.Compose, DockerCli.Sub.Ls, DockerCli.Flag.All, DockerCli.Flag.Format, DockerCli.Format.ComposeJson], 6000)
    if (!r.ok) return []
    try {
      const arr = JSON.parse(r.out.trim() || '[]')
      return Array.isArray(arr) ? (arr as DockerRow[]) : []
    } catch {
      return []
    }
  })

  // Live one-shot resource usage, keyed by container ID — merged into rows.
  handle(Channel.Docker.Stats, async () => {
    const r = await dockerRun([DockerCli.Sub.Stats, DockerCli.Flag.NoStream, DockerCli.Flag.Format, DockerCli.Format.Json], 12000)
    return r.ok ? parseJsonLines(r.out) : []
  })

  handle(Channel.Docker.Inspect, async ({ kind, id }) => {
    let cmd: string[]
    switch (kind) {
      case 'image':
        cmd = [DockerCli.Sub.Image, DockerCli.Sub.Inspect, id]
        break
      case 'volume':
        cmd = [DockerCli.Sub.Volume, DockerCli.Sub.Inspect, id]
        break
      case 'network':
        cmd = [DockerCli.Sub.Network, DockerCli.Sub.Inspect, id]
        break
      default:
        cmd = [DockerCli.Sub.Inspect, id]
    }
    const r = await dockerRun(cmd)
    return r.ok ? r.out : r.err || 'inspect failed'
  })

  handle(Channel.Docker.Logs, async ({ id, tail }) => {
    const r = await dockerRun([DockerCli.Sub.Logs, DockerCli.Flag.Tail, String(tail ?? 500), id], 8000)
    // docker logs writes app output to stderr too; return whichever has content.
    return r.out || r.err || ''
  })

  // Mutations: start/stop/restart/pause/unpause/remove a container, remove an
  // image/volume/network, or up/down/restart a compose project.
  handle(Channel.Docker.Action, async ({ kind, action, id, configFile }) => {
    let args: string[]
    switch (kind) {
      case 'container':
        // start | stop | restart | pause | unpause pass `action` straight through.
        args = action === DockerCli.Action.Remove ? [DockerCli.Sub.Rm, DockerCli.Flag.Force, id] : [action, id]
        break
      case 'image':
        args = [DockerCli.Sub.Rmi, DockerCli.Flag.Force, id]
        break
      case 'volume':
        args = [DockerCli.Sub.Volume, DockerCli.Sub.Rm, DockerCli.Flag.Force, id]
        break
      case 'network':
        args = [DockerCli.Sub.Network, DockerCli.Sub.Rm, id]
        break
      case 'compose': {
        if (!configFile) return { ok: false, error: 'unsupported action' }
        switch (action) {
          case DockerCli.Action.Down:
          case DockerCli.Action.Restart:
          case DockerCli.Action.Stop:
          case DockerCli.Action.Start:
            args = [DockerCli.Sub.Compose, DockerCli.Flag.File, configFile, action]
            break
          default:
            return { ok: false, error: 'unsupported compose action' }
        }
        break
      }
      default:
        return { ok: false, error: 'unsupported action' }
    }
    const r = await dockerRun(args, 30000)
    return r.ok ? { ok: true } : { ok: false, error: (r.err || 'action failed').trim() }
  })

  // System-wide cleanup. `images` also prunes unused images, not just dangling.
  handle(Channel.Docker.Prune, async ({ target }) => {
    let args: string[]
    switch (target) {
      case 'images':
        args = [DockerCli.Sub.Image, DockerCli.Sub.Prune, DockerCli.Flag.AllShort, DockerCli.Flag.Force]
        break
      case 'volumes':
        args = [DockerCli.Sub.Volume, DockerCli.Sub.Prune, DockerCli.Flag.Force]
        break
      case 'networks':
        args = [DockerCli.Sub.Network, DockerCli.Sub.Prune, DockerCli.Flag.Force]
        break
      default:
        args = [DockerCli.Sub.Container, DockerCli.Sub.Prune, DockerCli.Flag.Force]
    }
    const r = await dockerRun(args, 30000)
    return r.ok ? { ok: true, out: r.out.trim() } : { ok: false, error: (r.err || 'prune failed').trim() }
  })
}
