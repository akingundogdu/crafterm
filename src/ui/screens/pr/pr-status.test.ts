import { describe, it, expect } from 'vitest'
import type { PullRequest, WorkflowRun, DeploymentStatus } from '@bridge/api'
import { overallState, runState, deployState, stepMark, ago } from './pr-status'

const pr = (over: Partial<PullRequest> = {}): PullRequest => ({
  number: 1,
  title: 't',
  headRefName: 'feat',
  baseRefName: 'main',
  state: 'OPEN',
  isDraft: false,
  mergeable: 'MERGEABLE',
  reviewDecision: '',
  url: '',
  comments: 0,
  checks: { pass: 0, fail: 0, pending: 0, total: 0, state: 'none' },
  updatedAt: '',
  ...over
})

const run = (over: Partial<WorkflowRun> = {}): WorkflowRun => ({
  id: 1,
  name: 'CI',
  title: '',
  status: 'completed',
  conclusion: 'success',
  event: 'push',
  headBranch: 'main',
  headSha: 'abc',
  url: '',
  createdAt: '',
  ...over
})

const dep = (over: Partial<DeploymentStatus> = {}): DeploymentStatus => ({
  id: 1,
  environment: 'prod',
  ref: 'main',
  state: 'success',
  description: '',
  url: '',
  createdAt: '',
  ...over
})

describe('overallState', () => {
  it('draft is neutral regardless of checks', () => {
    expect(overallState(pr({ isDraft: true, checks: { pass: 0, fail: 1, pending: 0, total: 1, state: 'failure' } }))).toBe('neutral')
  })
  it('conflicts, changes-requested, or failed checks are blocked', () => {
    expect(overallState(pr({ mergeable: 'CONFLICTING' }))).toBe('blocked')
    expect(overallState(pr({ reviewDecision: 'CHANGES_REQUESTED' }))).toBe('blocked')
    expect(overallState(pr({ checks: { pass: 0, fail: 1, pending: 0, total: 1, state: 'failure' } }))).toBe('blocked')
  })
  it('pending checks are running', () => {
    expect(overallState(pr({ checks: { pass: 0, fail: 0, pending: 1, total: 1, state: 'pending' } }))).toBe('running')
  })
  it('approved + mergeable is ready, otherwise neutral', () => {
    expect(overallState(pr({ reviewDecision: 'APPROVED', mergeable: 'MERGEABLE' }))).toBe('ready')
    expect(overallState(pr({ reviewDecision: 'REVIEW_REQUIRED' }))).toBe('neutral')
  })
})

describe('runState', () => {
  it('non-completed runs are running', () => {
    expect(runState(run({ status: 'in_progress', conclusion: '' }))).toBe('running')
  })
  it('maps conclusions to ready/blocked/neutral', () => {
    expect(runState(run({ conclusion: 'success' }))).toBe('ready')
    expect(runState(run({ conclusion: 'failure' }))).toBe('blocked')
    expect(runState(run({ conclusion: 'timed_out' }))).toBe('blocked')
    expect(runState(run({ conclusion: 'cancelled' }))).toBe('neutral')
  })
})

describe('deployState', () => {
  it('maps states to rail colors', () => {
    expect(deployState(dep({ state: 'success' }))).toBe('ready')
    expect(deployState(dep({ state: 'failure' }))).toBe('blocked')
    expect(deployState(dep({ state: 'error' }))).toBe('blocked')
    expect(deployState(dep({ state: 'inactive' }))).toBe('neutral')
    expect(deployState(dep({ state: 'in_progress' }))).toBe('running')
  })
})

describe('stepMark', () => {
  it('shows a dot while running and a check/cross when done', () => {
    expect(stepMark('in_progress', '')).toBe('●')
    expect(stepMark('completed', 'success')).toBe('✓')
    expect(stepMark('completed', 'skipped')).toBe('✓')
    expect(stepMark('completed', 'failure')).toBe('✕')
  })
})

describe('ago', () => {
  const now = Date.parse('2026-06-17T12:00:00Z')
  it('returns empty for blank/invalid timestamps', () => {
    expect(ago('', now)).toBe('')
    expect(ago('not-a-date', now)).toBe('')
  })
  it('formats seconds/minutes/hours/days', () => {
    expect(ago('2026-06-17T11:59:30Z', now)).toBe('30s ago')
    expect(ago('2026-06-17T11:30:00Z', now)).toBe('30m ago')
    expect(ago('2026-06-17T09:00:00Z', now)).toBe('3h ago')
    expect(ago('2026-06-14T12:00:00Z', now)).toBe('3d ago')
  })
})
