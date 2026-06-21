import { LINK_SVG, MD_RE, stopAnd } from '../notebook.state'

// A single linked-file row with its hover actions. Pure factory: the action
// handlers are injected so this module stays free of IPC/command imports.

interface LinkedFile {
  path: string
  name: string
}

interface LinkedFileRowActions {
  onOpen: (path: string) => void
  onReveal: (path: string) => void
  onUnlink: (path: string) => void
}

function actBtn(text: string, title: string, fn: (e: Event) => void): HTMLButtonElement {
  return (
    <button class="notebook-action" title={title} onClick={fn}>
      {text}
    </button>
  ) as HTMLButtonElement
}

export function buildLinkedFileRow(f: LinkedFile, a: LinkedFileRowActions): HTMLElement {
  const actions = (<span class="nb-actions" />) as HTMLSpanElement
  actions.append(
    actBtn('⤴', 'Show in Finder', stopAnd(() => a.onReveal(f.path.slice(0, f.path.lastIndexOf('/')) || f.path))),
    actBtn('✕', 'Unlink', stopAnd(() => a.onUnlink(f.path)))
  )
  const row = (
    <div class="tab-item nb-linked-row" title={f.path} onClick={() => a.onOpen(f.path)}>
      <div class="tab-row">
        <span class="folder-icon" innerHTML={LINK_SVG} />
        <span class="tab-title">{MD_RE.test(f.name) ? f.name.replace(MD_RE, '') : f.name}</span>
        {actions}
      </div>
    </div>
  ) as HTMLDivElement
  return row
}
