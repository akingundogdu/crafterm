// A row's trailing action button: icon glyph, tooltip, optional extra class,
// and the work it performs when clicked.
export interface RowAction {
  icon: string
  title: string
  cls?: string
  run: () => void | Promise<void>
}
