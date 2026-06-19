import { describe, it, expect } from 'vitest'
import { shortPath, breadcrumb, refPath } from './path-ref'

describe('shortPath', () => {
  it('collapses the macOS and linux home prefixes to ~', () => {
    expect(shortPath('/Users/me/proj/a.ts')).toBe('~/proj/a.ts')
    expect(shortPath('/home/me/proj/a.ts')).toBe('~/proj/a.ts')
  })
  it('leaves other absolute paths untouched', () => {
    expect(shortPath('/etc/hosts')).toBe('/etc/hosts')
  })
})

describe('breadcrumb', () => {
  it('keeps the last three segments joined with arrows', () => {
    expect(breadcrumb('/Users/me/proj/src/a.ts')).toBe('proj  ›  src  ›  a.ts')
  })
  it('handles short paths without padding', () => {
    expect(breadcrumb('/etc/hosts')).toBe('etc  ›  hosts')
  })
})

describe('refPath', () => {
  it('returns a path relative to cwd when the file lives under it', () => {
    expect(refPath('/Users/me/proj/src/a.ts', '/Users/me/proj')).toBe('src/a.ts')
    expect(refPath('/Users/me/proj/src/a.ts', '/Users/me/proj/')).toBe('src/a.ts')
  })
  it('returns the absolute path when outside cwd or cwd is null', () => {
    expect(refPath('/Users/me/other/a.ts', '/Users/me/proj')).toBe('/Users/me/other/a.ts')
    expect(refPath('/Users/me/proj/a.ts', null)).toBe('/Users/me/proj/a.ts')
  })
})
