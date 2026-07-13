import { UITexts } from '@texts'

// Copy text to the clipboard and flash the trigger button's label. Pure UI helper
// (was @ui/accounts.state copyToClipboard) — self-contained, no @ui (§2.7).
export async function copyToClipboard(text: string, btn: HTMLButtonElement): Promise<void> {
  await navigator.clipboard.writeText(text)
  const prev = btn.textContent
  btn.textContent = UITexts.Accounts.copied
  setTimeout(() => (btn.textContent = prev), 1100)
}
