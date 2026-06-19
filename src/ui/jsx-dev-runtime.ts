// Dev variant of the automatic JSX runtime. In development esbuild/tsc emit
// `jsxDEV` from this module instead of `jsx`/`jsxs`. We forward to the production
// `jsx` — the extra dev args (key, source, self) are not needed for real-DOM
// construction.

import { jsx, Fragment } from './jsx-runtime'

export { Fragment }

type Props = Record<string, unknown> & { children?: unknown; ref?: (el: HTMLElement) => void }

export function jsxDEV(type: Parameters<typeof jsx>[0], props: Props): Node {
  return jsx(type, props)
}
