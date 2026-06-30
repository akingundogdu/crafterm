// The SSH picker has no module-local types; it operates on the global
// SshConnection shape. Re-export it for structural symmetry.
export type { SshConnection } from '@views/types/types'
