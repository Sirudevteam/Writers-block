const EMAIL_MAX = 254
const NAME_MAX = 100
const PASSWORD_MIN = 15
/** bcrypt / common auth limit */
const PASSWORD_MAX = 72

const COMMON_PASSWORDS = new Set([
  "123456789012345",
  "1234567890123456",
  "passwordpassword",
  "passwordpassword1",
  "qwertyqwerty12345",
  "letmeinletmein123",
  "adminadminadmin",
  "welcome123456789",
  "writersblock123",
  "writersblock12345",
])

export const PASSWORD_REQUIREMENT_MESSAGE =
  "Password must be 15-72 characters and must not be a common password."

export function validateEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const email = raw.trim().toLowerCase()
  if (!email || email.length > EMAIL_MAX) return null
  if (/[<>\"'`\s]/.test(email)) return null
  const re = /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/i
  if (!re.test(email)) return null
  return email
}

export function validatePasswordSignIn(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  if (raw.length < 1 || raw.length > PASSWORD_MAX) return null
  return raw
}

export function validatePasswordSignUp(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  if (raw.length < PASSWORD_MIN || raw.length > PASSWORD_MAX) return null
  const normalized = raw.trim().toLowerCase().replace(/\s+/g, "")
  if (COMMON_PASSWORDS.has(normalized)) return null
  return raw
}

export function validateDisplayName(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const name = raw.trim().replace(/\s+/g, " ")
  if (name.length < 1 || name.length > NAME_MAX) return null
  if (/[<>]/.test(name) || /[\u0000-\u001f]/.test(name)) return null
  return name
}
