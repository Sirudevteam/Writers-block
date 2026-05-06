import { createHash, randomInt, randomBytes, createCipheriv, createDecipheriv } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/infrastructure/db/types/database"

type AuthOtpPurpose = "signup" | "signin" | "password_reset"

const OTP_TTL_MINUTES = 10
const OTP_MAX_ATTEMPTS = 5

function otpChallengesTable(admin: SupabaseClient<Database>) {
  return (admin as any).schema("user_auth").from("otp_challenges")
}

function getOtpSecret(): string {
  const secret =
    process.env.AUTH_OTP_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXTAUTH_SECRET

  if (!secret) {
    throw new Error("AUTH_OTP_SECRET or SUPABASE_SERVICE_ROLE_KEY is required for auth OTPs")
  }

  return secret
}

function digest(input: string): string {
  return createHash("sha256").update(input).digest("hex")
}

function hashCode(email: string, purpose: AuthOtpPurpose, code: string): string {
  return digest(`${getOtpSecret()}:${purpose}:${email.toLowerCase()}:${code}`)
}

function encryptionKey(): Buffer {
  return createHash("sha256").update(getOtpSecret()).digest()
}

function generateOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0")
}

export function encryptPayload(value: unknown): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv)
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`
}

function decryptPayload<T>(value: string): T {
  const [ivRaw, tagRaw, encryptedRaw] = value.split(".")
  if (!ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error("Invalid encrypted auth payload")
  }

  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivRaw, "base64url"))
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final(),
  ])
  return JSON.parse(decrypted.toString("utf8")) as T
}

export async function createOtpChallenge(
  admin: SupabaseClient<Database>,
  {
    email,
    purpose,
    userId,
    encryptedPayload,
  }: {
    email: string
    purpose: AuthOtpPurpose
    userId: string
    encryptedPayload?: string
  }
): Promise<string> {
  const normalizedEmail = email.toLowerCase()
  const code = generateOtpCode()

  await otpChallengesTable(admin)
    .update({ consumed_at: new Date().toISOString() })
    .eq("email", normalizedEmail)
    .eq("purpose", purpose)
    .is("consumed_at", null)

  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString()
  const { error } = await otpChallengesTable(admin).insert({
    email: normalizedEmail,
    purpose,
    user_id: userId,
    code_hash: hashCode(normalizedEmail, purpose, code),
    encrypted_payload: encryptedPayload ?? null,
    max_attempts: OTP_MAX_ATTEMPTS,
    expires_at: expiresAt,
  })

  if (error) {
    throw new Error(`Failed to create auth OTP challenge: ${error.message}`)
  }

  return code
}

export async function consumeOtpChallenge<TPayload = unknown>(
  admin: SupabaseClient<Database>,
  {
    email,
    purpose,
    code,
  }: {
    email: string
    purpose: AuthOtpPurpose
    code: string
  }
): Promise<{ userId: string; payload: TPayload | null } | null> {
  const normalizedEmail = email.toLowerCase()
  const { data, error } = await (admin as any)
    .schema("user_auth")
    .rpc("consume_otp_challenge", {
      p_email: normalizedEmail,
      p_purpose: purpose,
      p_code_hash: hashCode(normalizedEmail, purpose, code),
    })
    .maybeSingle()

  if (error || !data?.user_id) {
    return null
  }

  return {
    userId: data.user_id as string,
    payload: data.encrypted_payload ? decryptPayload<TPayload>(data.encrypted_payload) : null,
  }
}
