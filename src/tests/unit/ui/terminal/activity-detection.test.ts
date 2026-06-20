// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { commandRunsClaude, looksLikeClaudeQuestion, paneStatus } from '@ui/terminal/activity-detection'
import { isPlanOwnedByPane } from '@ui/terminal/pane-info'
import type { Pane } from '@ui/types/types'

// Pure heuristics lifted verbatim from pane.ts in Phase 5. These guard the
// thresholds/patterns that drive the notification tone + sidebar status — the
// part the relocation must not change.

describe('commandRunsClaude', () => {
  it('matches claude as the first program word of any pipeline segment', () => {
    for (const cmd of ['claude', 'claude --resume x', 'claude-movve', 'code-foo && claude', 'run-thing-claude', 'foo | claude', 'a; claude']) {
      expect(commandRunsClaude(cmd), cmd).toBe(true)
    }
  })
  it('does not match claude as a mere argument or substring of another arg', () => {
    for (const cmd of ['echo claude', 'git commit -m "ask claude"', '']) {
      expect(commandRunsClaude(cmd), cmd).toBe(false)
    }
  })
})

describe('looksLikeClaudeQuestion', () => {
  it('detects prompts that are waiting on the user', () => {
    for (const tail of [
      'Do you want to proceed?',
      'Would you like to continue',
      'Are you sure',
      'Should I continue',
      '(y/n)',
      'Press enter to continue',
      '❯ Yes\n  No', // interactive selection menu glyph
      'awaiting your reply'
    ]) {
      expect(looksLikeClaudeQuestion(tail), tail).toBe(true)
    }
  })
  it('returns false for plain output or empty tail', () => {
    expect(looksLikeClaudeQuestion('')).toBe(false)
    expect(looksLikeClaudeQuestion('Build succeeded in 2.1s')).toBe(false)
  })
  it('only classifies on the last ~1500 chars', () => {
    // Question at the very end is seen even behind a long prefix.
    expect(looksLikeClaudeQuestion('x'.repeat(5000) + ' Do you want to proceed?')).toBe(true)
    // Question pushed out of the tail window by trailing noise is not seen.
    expect(looksLikeClaudeQuestion('Do you want to proceed? ' + 'y'.repeat(2000))).toBe(false)
  })
})

describe('paneStatus', () => {
  const make = (attention: boolean, busy: boolean): Pane => ({ attention, busy }) as unknown as Pane
  it('attention outranks busy', () => {
    expect(paneStatus(make(true, true))).toBe('attention')
  })
  it('running while busy and not attention', () => {
    expect(paneStatus(make(false, true))).toBe('running')
  })
  it('idle otherwise', () => {
    expect(paneStatus(make(false, false))).toBe('idle')
  })
})

describe('isPlanOwnedByPane', () => {
  const pane = { stableId: 'pane-uuid', claudeSessionId: 'sess-id' } as unknown as Pane
  it('owns a plan tagged with its stableId', () => {
    expect(isPlanOwnedByPane({ ownerStableId: 'pane-uuid', ownerSessionId: null }, pane)).toBe(true)
  })
  it('owns a plan tagged with its Claude session id', () => {
    expect(isPlanOwnedByPane({ ownerStableId: null, ownerSessionId: 'sess-id' }, pane)).toBe(true)
  })
  it('disowns a plan with no matching owner tag', () => {
    expect(isPlanOwnedByPane({ ownerStableId: 'other', ownerSessionId: 'nope' }, pane)).toBe(false)
    expect(isPlanOwnedByPane({ ownerStableId: null, ownerSessionId: null }, pane)).toBe(false)
  })
})
