import { createHash, randomBytes } from "node:crypto"

export const ORG_INVITE_TTL_DAYS = 7

export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url")
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex")
}

export function inviteExpiryFromNow(now = new Date()): string {
  return new Date(now.getTime() + ORG_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

export function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function inviteAcceptUrl(token: string): string {
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000"
  const url = new URL("/signin", origin)
  url.searchParams.set("invite", token)
  return url.toString()
}
