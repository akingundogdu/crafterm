import type { DockerRow, DockerKind } from '@services/docker/docker.types'

// Pure data helpers for the Docker tab: tolerant field lookup over docker's
// capitalised JSON keys, and the high-value [label, value] inspect tables per
// resource kind. No DOM/IPC — unit-testable in isolation.

export type KV = [string, string]

// Field lookup tolerant of docker's capitalised json keys.
export function field(row: DockerRow, ...keys: string[]): string {
  for (const k of keys) if (row[k] != null && row[k] !== '') return String(row[k])
  return ''
}

export function fmtPorts(host: Record<string, unknown>): string {
  const ports = (host?.NetworkSettings as { Ports?: Record<string, unknown> })?.Ports
  if (!ports || typeof ports !== 'object') return ''
  const out: string[] = []
  for (const [container, binds] of Object.entries(ports)) {
    if (Array.isArray(binds) && binds.length) {
      for (const b of binds as { HostIp?: string; HostPort?: string }[]) {
        out.push(`${b.HostIp || '0.0.0.0'}:${b.HostPort} → ${container}`)
      }
    } else {
      out.push(container)
    }
  }
  return out.join('\n')
}

// Build the high-value [label, value] pairs for a parsed inspect object by kind.
export function inspectFields(kind: DockerKind, o: Record<string, unknown>): KV[] {
  const get = (path: string): unknown =>
    path.split('.').reduce<unknown>((acc, k) => (acc as Record<string, unknown>)?.[k], o)
  const str = (v: unknown): string =>
    v == null ? '' : Array.isArray(v) ? v.join('\n') : typeof v === 'object' ? JSON.stringify(v) : String(v)
  const rows: KV[] = []
  const push = (label: string, value: string): void => {
    if (value && value.trim()) rows.push([label, value])
  }
  if (kind === 'container') {
    const state = get('State') as Record<string, unknown> | undefined
    push('State', [str(state?.Status), state?.Running ? '(running)' : ''].filter(Boolean).join(' '))
    push('Image', str(get('Config.Image')))
    push('Command', [str(get('Path')), ...((get('Args') as string[]) || [])].filter(Boolean).join(' '))
    push('Created', str(get('Created')))
    push('Restart', str(get('HostConfig.RestartPolicy.Name')))
    push('Ports', fmtPorts(o))
    const mounts = (get('Mounts') as { Source?: string; Destination?: string }[]) || []
    push('Mounts', mounts.map((m) => `${m.Source || ''} → ${m.Destination || ''}`).join('\n'))
    const nets = (get('NetworkSettings.Networks') as Record<string, { IPAddress?: string }>) || {}
    push(
      'Networks',
      Object.entries(nets)
        .map(([n, v]) => `${n}${v?.IPAddress ? ' (' + v.IPAddress + ')' : ''}`)
        .join('\n')
    )
    push('Env', str(get('Config.Env')))
  } else if (kind === 'image') {
    push('Id', str(o.Id))
    push('RepoTags', str(o.RepoTags))
    push('Size', str(o.Size))
    push('Architecture', [str(o.Os), str(o.Architecture)].filter(Boolean).join('/'))
    push('Created', str(o.Created))
    push('Cmd', str(get('Config.Cmd')))
    push('Env', str(get('Config.Env')))
    const layers = (get('RootFS.Layers') as unknown[]) || []
    push('Layers', layers.length ? String(layers.length) : '')
  } else if (kind === 'volume') {
    push('Name', str(o.Name))
    push('Driver', str(o.Driver))
    push('Mountpoint', str(o.Mountpoint))
    push('Scope', str(o.Scope))
    push('Created', str(o.CreatedAt))
    push('Labels', str(o.Labels))
  } else {
    push('Name', str(o.Name))
    push('Driver', str(o.Driver))
    push('Scope', str(o.Scope))
    const ipam = (get('IPAM.Config') as { Subnet?: string; Gateway?: string }[]) || []
    push('IPAM', ipam.map((c) => [c.Subnet, c.Gateway].filter(Boolean).join(' / ')).join('\n'))
    const conts = (get('Containers') as Record<string, { Name?: string }>) || {}
    push('Containers', Object.values(conts).map((c) => str(c?.Name)).join('\n'))
  }
  return rows
}
