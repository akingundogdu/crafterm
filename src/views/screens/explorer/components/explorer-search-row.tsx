import { Component } from '@geajs/core'

export interface ExplorerSearchRowProps {
  name: string
  subPath: string
  onClick: (e: MouseEvent) => void
}

// A single flat file-search result row (name + dimmed parent path). One-shot gea
// Component: the explorer rebuilds the whole result list on every query, so no
// store subscription is needed. Data arrives via the constructor into plain fields,
// because a gea Component only populates `this.props` when rendered from a parent
// template, not from a manual `new X()`.
export default class ExplorerSearchRow extends Component {
  private readonly rowName: string
  private readonly subPath: string
  private readonly onClickFn: (e: MouseEvent) => void

  constructor(props: ExplorerSearchRowProps) {
    super()
    this.rowName = props.name
    this.subPath = props.subPath
    this.onClickFn = props.onClick
  }

  template() {
    return (
      <div class="explorer-row file" style="padding-left:6px" onClick={(e: MouseEvent) => this.onClickFn(e)}>
        <span class="explorer-tri" />
        <span class="explorer-name">{this.rowName}</span>
        <span class="explorer-sub">{this.subPath}</span>
      </div>
    )
  }
}

// Builds the search-row element for the explorer to insert. Signature preserved so
// the explorer.ts consumer (buildExplorerSearchRow) resolves unchanged.
export function buildExplorerSearchRow(props: ExplorerSearchRowProps): HTMLElement {
  const host = document.createElement('div')
  new ExplorerSearchRow(props).render(host)
  return host.firstElementChild as HTMLElement
}
