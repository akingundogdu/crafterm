import { settings } from '@views/state/spine'
import { UITexts } from '@texts'
import { labeledInput } from '../../shared'

interface TodoFileFieldProps {
  panel: HTMLElement
  onSave: (v: string) => void
}

// Todo file field: path to the markdown file shown in the Improve Crafterm panel.
export function buildTodoFileField(props: TodoFileFieldProps): void {
  const { panel, onSave } = props
  const todo = labeledInput(panel, UITexts.Settings.workspace.todoFile, 'text', settings.todoFile, onSave)
  todo.style.maxWidth = '280px'
  todo.placeholder = '~/path/to/todo-list.md'
  panel.insertAdjacentHTML(
    'beforeend',
    '<div class="field-hint">Path to the markdown file shown in the Improve Crafterm panel.</div>'
  )
}
