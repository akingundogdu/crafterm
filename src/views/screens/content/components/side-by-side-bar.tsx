import { Component } from '@geajs/core'
import './side-by-side-bar.css'
import {
  EXIT_LABEL,
  EXIT_TITLE,
  ADD_TERMINAL_LABEL,
  ADD_TERMINAL_TITLE,
  ADD_CLAUDE_LABEL,
  ADD_CLAUDE_TITLE,
  sideBySideTitle,
  leaveSideBySide,
  addToSideBySide
} from './side-by-side-bar.store'

// The strip above the tiled terminals: what you are looking at, two ways to grow
// it (a terminal or a Claude session beside the active tile), and the way out.
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
        <button
          class="side-by-side-bar-action"
          title={ADD_TERMINAL_TITLE}
          onClick={() => void addToSideBySide(false)}
        >
          {ADD_TERMINAL_LABEL}
        </button>
        <button
          class="side-by-side-bar-action"
          title={ADD_CLAUDE_TITLE}
          onClick={() => void addToSideBySide(true)}
        >
          {ADD_CLAUDE_LABEL}
        </button>
        <button class="side-by-side-bar-action side-by-side-bar-exit" title={EXIT_TITLE} onClick={() => leaveSideBySide()}>
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
