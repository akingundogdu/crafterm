import { describe, it, expect } from 'vitest'
import { PALETTE_SEED } from '@views/palette-seed/palette-seed'

describe('PALETTE_SEED', () => {
  it('is a non-empty list of {id,category,name,command} non-empty strings', () => {
    expect(PALETTE_SEED.length).toBeGreaterThan(0)
    for (const c of PALETTE_SEED) {
      expect(typeof c.id).toBe('string')
      expect(c.id.length).toBeGreaterThan(0)
      expect(typeof c.category).toBe('string')
      expect(c.category.length).toBeGreaterThan(0)
      expect(typeof c.name).toBe('string')
      expect(c.name.length).toBeGreaterThan(0)
      expect(typeof c.command).toBe('string')
      expect(c.command.length).toBeGreaterThan(0)
    }
  })

  it('has unique ids', () => {
    expect(new Set(PALETTE_SEED.map((c) => c.id)).size).toBe(PALETTE_SEED.length)
  })

  it('contains the git/status seed', () => {
    const s = PALETTE_SEED.find((c) => c.category === 'git' && c.name === 'status')
    expect(s).toBeDefined()
    expect(s?.command).toBe('git status')
  })

  it('has 15 git + 14 linux entries (29 total)', () => {
    expect(PALETTE_SEED.filter((c) => c.category === 'git').length).toBe(15)
    expect(PALETTE_SEED.filter((c) => c.category === 'linux').length).toBe(14)
    expect(PALETTE_SEED.length).toBe(29)
  })
})
