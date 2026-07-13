import { describe, it, expect } from 'vitest'
import { norm, baseName, shq } from '@services/domain/worktree-path'

describe('worktree path helpers', () => {
  it('norm strips trailing slashes', () => {
    expect(norm('/a/b/')).toBe('/a/b')
    expect(norm('/a/b///')).toBe('/a/b')
    expect(norm('/a/b')).toBe('/a/b')
  })

  it('baseName returns the last segment', () => {
    expect(baseName('/a/b/c')).toBe('c')
    expect(baseName('/a/b/c/')).toBe('c')
    expect(baseName('solo')).toBe('solo')
  })

  it('shq single-quotes and escapes embedded quotes', () => {
    expect(shq('plain')).toBe("'plain'")
    expect(shq("it's")).toBe("'it'\\''s'")
  })
})
