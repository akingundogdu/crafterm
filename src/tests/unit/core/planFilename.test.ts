import { describe, it, expect } from 'vitest'
import { parsePlanFilename } from '@core/planFilename/planFilename'

const UUID = '7cbb26b8-3e9e-4c2e-bc98-9b9e7236928a'
const UUID2 = '0925d895-73c2-44bd-8787-fa658dd04bbb'

describe('parsePlanFilename', () => {
  it('returns null when the extension is not a markdown variant', () => {
    expect(parsePlanFilename('main-feat.txt', 'main')).toBeNull()
  })

  it('returns null when the branch prefix does not match', () => {
    expect(parsePlanFilename('other-feat.md', 'main')).toBeNull()
  })

  it('parses a legacy/shared plan (no owner tag)', () => {
    expect(parsePlanFilename('main-my-slug.md', 'main')).toEqual({
      slug: 'my-slug',
      ownerStableId: null,
      ownerSessionId: null
    })
  })

  it('parses a `--pane-<uuid>` tag as the owning pane stableId', () => {
    expect(parsePlanFilename(`main-my-slug--pane-${UUID}.md`, 'main')).toEqual({
      slug: 'my-slug',
      ownerStableId: UUID,
      ownerSessionId: null
    })
  })

  it('parses a trailing `-<uuid>` as the Claude session id', () => {
    expect(parsePlanFilename(`main-my-slug-${UUID}.md`, 'main')).toEqual({
      slug: 'my-slug',
      ownerStableId: null,
      ownerSessionId: UUID
    })
  })

  it('lets the pane tag win even when a session segment trails it', () => {
    const parsed = parsePlanFilename(`main-slug--pane-${UUID}-${UUID2}.md`, 'main')
    expect(parsed?.ownerStableId).toBe(UUID)
    expect(parsed?.ownerSessionId).toBeNull()
  })

  it('matches a branch whose slashes were rewritten to dashes', () => {
    expect(parsePlanFilename('feat-x-slug.md', 'feat/x')).toEqual({
      slug: 'slug',
      ownerStableId: null,
      ownerSessionId: null
    })
  })
})
