import type { TreeRuntime } from './treeview.types'

// A module registry mapping each tree's `storeId` to its render runtime. The gea
// row/header/list Components carry only the string `storeId` as a prop and look
// the runtime up here — so they reach the genuine per-instance reactive store
// (and the plain node/slot maps) without a Store or DOM node ever being handed
// across a proxied gea prop. Trees are long-lived singletons; `clearTreeRuntime`
// exists for teardown but is rarely needed.
const runtimes = new Map<string, TreeRuntime<unknown>>()

export function setTreeRuntime<T>(id: string, runtime: TreeRuntime<T>): void {
  runtimes.set(id, runtime as TreeRuntime<unknown>)
}

export function getTreeRuntime<T>(id: string): TreeRuntime<T> {
  return runtimes.get(id) as unknown as TreeRuntime<T>
}

export function clearTreeRuntime(id: string): void {
  runtimes.delete(id)
}
