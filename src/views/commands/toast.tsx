import { Component } from '@geajs/core'

// The transient flash toast node, built as gea JSX. The `flash()` action seeds a
// singleton `#toast` element (reused across flashes); this factory builds it.
class Toast extends Component {
  template() {
    return <div id="toast" />
  }
}

export function createToastEl(): HTMLElement {
  const host = document.createElement('div')
  new Toast().render(host)
  return host.firstElementChild as HTMLElement
}
