import { Component } from '@geajs/core'

// Text input primitive (gea). Plain <input> with value/placeholder/type and an
// optional `onInput` so a store can bind the value reactively. Self-contained —
// no @ui import (§2.7).
export default class Input extends Component {
  declare props: {
    value?: string
    placeholder?: string
    type?: string
    onInput?: (e: Event) => void
  }

  template({ value, placeholder, type, onInput }: this['props']) {
    return <input type={type ?? 'text'} value={value ?? ''} placeholder={placeholder} onInput={onInput} />
  }
}
