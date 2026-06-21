import { UITexts } from '@texts'
import type { DockerKind } from '@services/docker/docker.types'
import { createButton } from '@ui/components'
import { inspectFields } from '../inspect'
import { parseInspect, makeRawToggle } from './detail-modal.state'

// The parsed inspect data rendered as a key/value table with a Raw JSON toggle.
// Falls back to the raw text when parsing fails. Returns the content as a
// fragment so the caller controls placement.

export function createInspectPanel(kind: DockerKind, raw: string): DocumentFragment {
  const parsed = parseInspect(raw)
  if (!parsed) {
    return (
      <>
        <pre class="docker-pre" ref={(el: HTMLPreElement) => (el.textContent = raw || '(empty)')} />
      </>
    ) as unknown as DocumentFragment
  }

  const table = (
    <div class="docker-kv">
      {inspectFields(kind, parsed).map(([label, value]) => (
        <>
          <div class="docker-kv-key">{label}</div>
          <div class="docker-kv-val">{value}</div>
        </>
      ))}
    </div>
  ) as HTMLDivElement

  const pre = (
    <pre class="docker-pre" style="display: none">
      {JSON.stringify(parsed, null, 2)}
    </pre>
  ) as HTMLPreElement

  const toggle = createButton({
    className: 'settings-inline-btn docker-raw-toggle',
    text: UITexts.Docker.detail.rawJson,
    onClick: makeRawToggle(table, pre)
  })

  return (
    <>
      {toggle}
      {table}
      {pre}
    </>
  ) as unknown as DocumentFragment
}
