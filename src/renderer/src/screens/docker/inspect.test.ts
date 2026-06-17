import { describe, it, expect } from 'vitest'
import { field, fmtPorts, inspectFields } from './inspect'

describe('field', () => {
  it('returns the first non-empty key, tolerant of capitalisation variants', () => {
    expect(field({ Names: 'web', Name: 'fallback' }, 'Names', 'Name')).toBe('web')
    expect(field({ Name: 'fallback' }, 'Names', 'Name')).toBe('fallback')
  })
  it('skips empty strings and missing keys', () => {
    expect(field({ ID: '', Name: 'x' }, 'ID', 'Name')).toBe('x')
    expect(field({}, 'ID')).toBe('')
  })
})

describe('fmtPorts', () => {
  it('formats published bindings as host → container', () => {
    const host = {
      NetworkSettings: {
        Ports: {
          '80/tcp': [{ HostIp: '0.0.0.0', HostPort: '8080' }],
          '443/tcp': null
        }
      }
    }
    expect(fmtPorts(host)).toBe('0.0.0.0:8080 → 80/tcp\n443/tcp')
  })
  it('returns empty when there are no ports', () => {
    expect(fmtPorts({})).toBe('')
  })
})

describe('inspectFields', () => {
  it('extracts the high-value container fields', () => {
    const obj = {
      State: { Status: 'running', Running: true },
      Config: { Image: 'nginx:latest', Env: ['A=1', 'B=2'] },
      Path: 'nginx',
      Args: ['-g', 'daemon off;'],
      Created: '2026-01-01'
    }
    const rows = inspectFields('container', obj)
    const map = Object.fromEntries(rows)
    expect(map.State).toBe('running (running)')
    expect(map.Image).toBe('nginx:latest')
    expect(map.Command).toBe('nginx -g daemon off;')
    expect(map.Env).toBe('A=1\nB=2')
  })
  it('omits empty values', () => {
    const rows = inspectFields('volume', { Name: 'data', Driver: '', Scope: 'local' })
    const labels = rows.map(([k]) => k)
    expect(labels).toContain('Name')
    expect(labels).toContain('Scope')
    expect(labels).not.toContain('Driver')
  })
  it('formats image architecture as os/arch', () => {
    const rows = inspectFields('image', { Id: 'sha256:abc', Os: 'linux', Architecture: 'arm64' })
    expect(Object.fromEntries(rows).Architecture).toBe('linux/arm64')
  })
})
