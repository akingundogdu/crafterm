import { Component } from '@geajs/core'
import './side-by-side-bar.css'
import { EXIT_LABEL, EXIT_TITLE, sideBySideTitle, leaveSideBySide } from './side-by-side-bar.store'

// The strip above the tiled terminals: what you are looking at, and the way out.
// Static per render (the controller rebuilds it whenever the view changes), so the
// count arrives through a constructor field — a manual `new X()` never populates
// `this.props`.
class SideBySideBar extends Component {
  private readonly count: number

  constructor(opts: { count: number }) {
    super()
    this.count = opts.count
  }

  template() {
    return (
      <div class="side-by-side-bar">
        <span class="side-by-side-bar-title">{sideBySideTitle(this.count)}</span>
        <button class="side-by-side-bar-exit" title={EXIT_TITLE} onClick={() => leaveSideBySide()}>
          {EXIT_LABEL}
        </button>
      </div>
    )
  }
}

export function buildSideBySideBar(count: number): HTMLElement {
  const host = document.createElement('div')
  host.className = 'side-by-side-bar-host'
  new SideBySideBar({ count }).render(host)
  return host
}
