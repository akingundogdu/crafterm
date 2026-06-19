import { z } from 'zod'

// Saved SSH connection — mirrors `SshConnection` in types.ts exactly (HR-1).
// Password stored plaintext by design (copy-only, never auto-typed).

export const sshConnectionSchema = z.object({
  id: z.string(),
  label: z.string(),
  host: z.string(),
  user: z.string().optional(),
  port: z.number().optional(),
  password: z.string().optional()
})

export type SshConnection = z.infer<typeof sshConnectionSchema>

export function makeSshConnection(
  p: Partial<SshConnection> & Pick<SshConnection, 'label' | 'host'>
): SshConnection {
  return sshConnectionSchema.parse({ id: crypto.randomUUID(), ...p })
}
