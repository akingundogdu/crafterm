import { Component } from '@geajs/core'
import { UITexts } from '@texts'
import type { DockerKind } from '@services/docker/docker.types'
import { inspectFields } from '../inspect'
import { parseInspect, makeRawToggle } from './detail-modal.store'

// The parsed inspect data rendered as a key/value grid with a Raw JSON toggle.
// Falls back to the raw text when parsing fails. gea Component (§2.7): static
// props via constructor fields (a manual `new X()` never populates `this.props`);
// the Raw/Structured toggle flips display imperatively through element refs, so
// the component renders once and never re-renders. Each field row is a
// display:contents wrapper so its key/value divs remain direct grid items of
// `.docker-kv`. Mounted into a detail-modal panel by DetailModal. Self-contained.
export default class InspectPanel extends Component {
  private readonly kind: DockerKind
  private readonly raw: string
  private readonly parsed: Record<string, unknown> | null

  tableEl: HTMLDivElement | null = null
  preEl: HTMLPreElement | null = null

  constructor(opts: { kind: DockerKind; raw: string }) {
    super()
    this.kind = opts.kind
    this.raw = opts.raw
    this.parsed = parseInspect(opts.raw)
  }

  // Reuses the legacy raw/structured toggle, reading the live element refs at
  // click time (they are wired before any interaction can occur).
  private toggleRaw = (e: MouseEvent): void => {
    if (this.tableEl && this.preEl) makeRawToggle(this.tableEl, this.preEl)(e)
  }

  template() {
    const parsed = this.parsed
    const fields = parsed ? inspectFields(this.kind, parsed) : []
    return (
      <div style={{ display: 'contents' }}>
        {!parsed && <pre class="docker-pre">{this.raw || '(empty)'}</pre>}
        {parsed && (
          <button class="settings-inline-btn docker-raw-toggle" type="button" onClick={this.toggleRaw}>
            {UITexts.Docker.detail.rawJson}
          </button>
        )}
        {parsed && (
          <div class="docker-kv" ref={this.tableEl}>
            {fields.map((kv, i) => (
              <div key={i} style={{ display: 'contents' }}>
                <div class="docker-kv-key">{kv[0]}</div>
                <div class="docker-kv-val">{kv[1]}</div>
              </div>
            ))}
          </div>
        )}
        {parsed && (
          <pre class="docker-pre" ref={this.preEl} style={{ display: 'none' }}>
            {JSON.stringify(parsed, null, 2)}
          </pre>
        )}
      </div>
    )
  }
}
