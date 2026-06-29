import { Component } from '@geajs/core'

// Multi-line text input primitive (gea). Plain <textarea> with
// value/placeholder/rows and an optional `onInput` for reactive binding.
// Self-contained — no @ui import (§2.7).
export default class Textarea extends Component {
  declare props: {
    value?: string
    placeholder?: string
    rows?: number
    onInput?: (e: Event) => void
  }

  template({ value, placeholder, rows, onInput }: this['props']) {
    return (
      <textarea rows={rows} placeholder={placeholder} onInput={onInput}>
        {value ?? ''}
      </textarea>
    )
  }
}
