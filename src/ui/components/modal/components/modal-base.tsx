// Modal base: the `.modal.modal-prompt[ <extra>]` container with its h2 title.
// The actions row is appended by the caller so DOM order stays `h2 → actions`.
export function createModalBase(modalClass: string, title: string, actions: HTMLDivElement): HTMLDivElement {
  return (
    <div class={modalClass}>
      <h2>{title}</h2>
      {actions}
    </div>
  ) as HTMLDivElement
}
