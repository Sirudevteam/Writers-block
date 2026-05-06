/** Privacy-friendly hint for “check your email” screens (not full address in UI). */
export function maskEmail(email: string): string {
  const at = email.indexOf("@")
  if (at <= 0) return "your email"
  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  if (!domain) return "your email"
  if (local.length <= 2) {
    return `**@${domain}`
  }
  const inner = Math.min(4, Math.max(1, local.length - 2))
  return `${local[0]}${"*".repeat(inner)}${local[local.length - 1]}@${domain}`
}
