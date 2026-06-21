// Field container: the `.field` row wrapping a <label> + a control (input/select),
// mirroring the existing `div.field > label + control` markup exactly.
export function createFieldContainer(label: HTMLLabelElement, control: HTMLElement): HTMLDivElement {
  return (
    <div class="field">
      {label}
      {control}
    </div>
  ) as HTMLDivElement
}
