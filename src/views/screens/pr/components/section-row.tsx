import { Component } from '@geajs/core'
import type { PrSection } from '../pr.types'
import PrCard from './pr-card'
import RunCard from './run-card'
import DeployCard from './deploy-card'

// Renders one heterogeneous PR-list row. Keyed by the parent map (key on this
// component), then branched here so each card stays a directly-nested child gea
// Component (the supported composition pattern, §5.9).
export default class SectionRow extends Component {
  declare props: { section: PrSection }

  template({ section: s }: this['props']) {
    return (
      <span style={{ display: 'contents' }}>
        {s.kind === 'pr' && <PrCard pr={s.pr} cwd={s.cwd} isCurrent={s.isCurrent} />}
        {s.kind === 'run' && <RunCard run={s.run} cwd={s.cwd} />}
        {s.kind === 'deploy' && <DeployCard d={s.d} />}
        {s.kind === 'repo-label' && <div class="pr-repo">{s.repo}</div>}
        {s.kind === 'section-head' && (
          <div class="pr-section-head" title={s.title}>
            {s.label}
          </div>
        )}
        {s.kind === 'empty' && <div class={'notif-empty' + (s.group ? ' pr-group-empty' : '')}>{s.text}</div>}
      </span>
    )
  }
}
