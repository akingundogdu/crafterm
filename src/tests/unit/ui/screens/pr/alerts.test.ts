import { describe, it, expect, vi } from 'vitest'
import type { WorkflowRun, DeploymentStatus } from '@services/pr/pr.types'
import { createAlertTracker, type CheckItem } from '@views/screens/pr/alerts'

const check = (state: string, over: Partial<CheckItem> = {}): CheckItem => ({
  key: 'repo#1',
  number: 1,
  title: 'My PR',
  state,
  ...over
})

const run = (over: Partial<WorkflowRun> = {}): WorkflowRun =>
  ({ id: 1, name: 'CI', title: 'build', status: 'completed', conclusion: 'success', event: 'push', headBranch: 'main', headSha: 'a', url: '', createdAt: '', ...over }) as WorkflowRun

const dep = (over: Partial<DeploymentStatus> = {}): DeploymentStatus =>
  ({ id: 1, environment: 'prod', ref: 'main', state: 'pending', description: '', url: '', createdAt: '' , ...over }) as DeploymentStatus

describe('createAlertTracker.noteChecks', () => {
  it('does not alert on the first observation', () => {
    const emit = vi.fn()
    createAlertTracker(emit).noteChecks([check('pending')])
    expect(emit).not.toHaveBeenCalled()
  })
  it('alerts when checks leave pending for success/failure', () => {
    const emit = vi.fn()
    const t = createAlertTracker(emit)
    t.noteChecks([check('pending')])
    t.noteChecks([check('success')])
    expect(emit).toHaveBeenCalledWith('PR #1 checks passed', 'My PR')
    t.noteChecks([check('pending')]) // re-arm
    t.noteChecks([check('failure')])
    expect(emit).toHaveBeenCalledWith('PR #1 checks failed', 'My PR')
  })
  it('does not alert pending -> pending', () => {
    const emit = vi.fn()
    const t = createAlertTracker(emit)
    t.noteChecks([check('pending')])
    t.noteChecks([check('pending')])
    expect(emit).not.toHaveBeenCalled()
  })
})

describe('createAlertTracker.noteRuns', () => {
  it('alerts when a run transitions to completed', () => {
    const emit = vi.fn()
    const t = createAlertTracker(emit)
    t.noteRuns([run({ status: 'in_progress', conclusion: '' })])
    t.noteRuns([run({ status: 'completed', conclusion: 'success' })])
    expect(emit).toHaveBeenCalledWith('Run CI succeeded', 'build')
  })
  it('reports the conclusion text on failure', () => {
    const emit = vi.fn()
    const t = createAlertTracker(emit)
    t.noteRuns([run({ status: 'in_progress', conclusion: '' })])
    t.noteRuns([run({ status: 'completed', conclusion: 'failure' })])
    expect(emit).toHaveBeenCalledWith('Run CI failure', 'build')
  })
  it('does not alert when already completed on first sight', () => {
    const emit = vi.fn()
    createAlertTracker(emit).noteRuns([run({ status: 'completed' })])
    expect(emit).not.toHaveBeenCalled()
  })
})

describe('createAlertTracker.noteDeploys', () => {
  it('alerts when a deployment reaches a terminal state', () => {
    const emit = vi.fn()
    const t = createAlertTracker(emit)
    t.noteDeploys([dep({ state: 'in_progress' })])
    t.noteDeploys([dep({ state: 'success', description: 'shipped' })])
    expect(emit).toHaveBeenCalledWith('Deploy prod success', 'shipped')
  })
  it('ignores the inactive terminal state', () => {
    const emit = vi.fn()
    const t = createAlertTracker(emit)
    t.noteDeploys([dep({ state: 'in_progress' })])
    t.noteDeploys([dep({ state: 'inactive' })])
    expect(emit).not.toHaveBeenCalled()
  })
  it('falls back to ref when there is no description', () => {
    const emit = vi.fn()
    const t = createAlertTracker(emit)
    t.noteDeploys([dep({ state: 'pending' })])
    t.noteDeploys([dep({ state: 'failure', ref: 'main' })])
    expect(emit).toHaveBeenCalledWith('Deploy prod failure', 'main')
  })
})
