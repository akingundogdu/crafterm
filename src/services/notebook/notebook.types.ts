// Notebook domain data models (moved out of the former bridge api.d.ts).
export interface NbNode {
  name: string
  path: string
  kind: 'dir' | 'file'
  children?: NbNode[]
}
