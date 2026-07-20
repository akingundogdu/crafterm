import { describe, it, expect } from 'vitest'
import { linkTargetKind } from '@views/commands/link-target'

// Cmd+click on a terminal link must open the file in-app — Monaco for code, the viewer for
// markdown — the same destination the Files tree uses, never the user's external IDE.
describe('linkTargetKind', () => {
  it('routes http(s) links to a browser pane', () => {
    expect(linkTargetKind('https://example.dev')).toBe('url')
    expect(linkTargetKind('http://example.dev/a/b')).toBe('url')
  })

  it('routes markdown to the in-app viewer', () => {
    expect(linkTargetKind('docs/features.md')).toBe('markdown')
    expect(linkTargetKind('/abs/NOTES.MD')).toBe('markdown')
    expect(linkTargetKind('a.mdx')).toBe('markdown')
    expect(linkTargetKind('a.mdc')).toBe('markdown')
  })

  it('routes every other file to the Monaco code pane', () => {
    expect(linkTargetKind('src/views/commands/commands.ts')).toBe('code')
    expect(linkTargetKind('./a.tsx')).toBe('code')
    expect(linkTargetKind('/etc/hosts')).toBe('code')
    expect(linkTargetKind('~/x/main.py')).toBe('code')
    expect(linkTargetKind('Cargo.toml')).toBe('code')
  })
})
