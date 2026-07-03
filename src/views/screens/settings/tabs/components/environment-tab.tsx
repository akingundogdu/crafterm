import { Component } from '@geajs/core'
import { persistence } from '@repositories/persistence.service'
import type { ProjectNode } from '@views/types/types'
import LabeledTextField from '../../components/labeled-text-field'

// The Environment sub-tab: a single "Environment vars" textarea (raw KEY=VALUE lines).
// Mounted imperatively by the sub-tab build callback, so the RAW project node arrives
// via the constructor (never a proxied prop — §gea 5.3). The textarea is uncontrolled
// (LabeledTextField); the display:contents root keeps it a direct panel child (§gea 5.8).
export default class EnvironmentTab extends Component {
  private readonly p: ProjectNode

  constructor(p: ProjectNode) {
    super()
    this.p = p
  }

  private envChange = (v: string): void => {
    this.p.env = v.trim() || undefined
    persistence.save()
  }

  template() {
    return (
      <div style={{ display: 'contents' }}>
        <LabeledTextField
          label="Environment vars"
          value={this.p.env ?? ''}
          placeholder="KEY=VALUE (one per line, optional)"
          textarea
          rows={4}
          onChange={this.envChange}
        />
      </div>
    )
  }
}
