import { UITexts } from '@texts'
import type { DockerKind } from '@services/docker/docker.types'
import { el } from '@views/lib/dom'
import { inspectFields } from '../inspect'
import { parseInspect, makeRawToggle } from './detail-modal.state'

// The parsed inspect data rendered as a key/value table with a Raw JSON toggle.
// Falls back to the raw text when parsing fails. Returns a fragment so the caller
// controls placement. Imperative plain-DOM (the modal that hosts it is a
// self-managing imperative widget — gea reactivity buys nothing here).
export function createInspectPanel(kind: DockerKind, raw: string): DocumentFragment {
  const frag = document.createDocumentFragment()
  const parsed = parseInspect(raw)
  if (!parsed) {
    frag.appendChild(el('pre', { class: 'docker-pre' }, raw || '(empty)'))
    return frag
  }

  const table = el('div', { class: 'docker-kv' })
  for (const [label, value] of inspectFields(kind, parsed)) {
    table.appendChild(el('div', { class: 'docker-kv-key' }, label))
    table.appendChild(el('div', { class: 'docker-kv-val' }, value))
  }

  const pre = el('pre', { class: 'docker-pre' }, JSON.stringify(parsed, null, 2))
  pre.style.display = 'none'

  const toggle = el(
    'button',
    {
      class: 'settings-inline-btn docker-raw-toggle',
      type: 'button',
      onClick: makeRawToggle(table, pre)
    },
    UITexts.Docker.detail.rawJson
  )

  frag.append(toggle, table, pre)
  return frag
}
