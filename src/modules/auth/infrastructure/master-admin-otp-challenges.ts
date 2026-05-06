import { createCipheriv, createDecipheriv, createHash, randomInt, randomBytes } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/infrastructure/db/types/database"

const MASTER_ADMIN_OTP_TTL_MINUTES = 10
const MASTER_ADMIN_OTP_MAX_ATTEMPTS = 5
const MASTER_ADMIN_OTP_CONTEXT = "master_admin_signin"

function masterAdminOtpChallengesTable(admin: SupabaseClient<Database>) {
  return (admin as any).schema("master_admin").from("otp_challenges")
}

function getMasterAdminOtpSecret(): string {
  const secret =
    process.env.MASTER_ADMIN_OTP_SECRET ||
    process.env.AUTH_OTP_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXTAUTH_SECRET

  if (!secret) {
    throw new Error("MASTER_ADMIN_OTP_SECRET, AUTH_OTP_SECRET, or SUPABASE_SERVICE_ROLE_KEY is required for Master Admin OTPs")
  }

  return secret
}

function digest(input: string): string {
  return createHash("sha256").update(input).digest("hex")
}

function hashCode(email: string, code: string): string {
  return digest(`${getMasterAdminOtpSecret()}:${MASTER_ADMIN_OTP_CONTEXT}:${email.toLowerCase()}:${code}`)
}

function encryptionKey(): Buffer {
  return createHash("sha256").update(getMasterAdminOtpSecret()).digest()
}

function generateOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0")
}

export function encryptMasterAdminOtpPayload(value: unknown): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv)
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`
}

function decryptMasterAdminOtpPayload<T>(value: string): T {
  const [ivRaw, tagRaw, encryptedRaw] = value.split(".")
  if (!ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error("Invalid encrypted Master Admin OTP payload")
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivRaw, "base64url")
  )
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final(),
  ])
  return JSON.parse(decrypted.toString("utf8")) as T
}

export async function createMasterAdminOtpChallenge(
  admin: SupabaseClient<Database>,
  {
    email,
    userId,
    encryptedPayload,
  }: {
    email: string
    userId: string
    encryptedPayload: string
  }
): Promise<string> {
  const normalizedEmail = email.toLowerCase()
  const code = generateOtpCode()

  await masterAdminOtpChallengesTable(admin)
    .update({ consumed_at: new Date().toISOString() })
    .eq("email", normalizedEmail)
    .is("consumed_at", null)

  const expiresAt = new Date(Date.now() + MASTER_ADMIN_OTP_TTL_MINUTES * 60 * 1000).toISOString()
  const { error } = await masterAdminOtpChallengesTable(admin).insert({
    email: normalizedEmail,
    user_id: userId,
    code_hash: hashCode(normalizedEmail, code),
    encrypted_payload: encryptedPayload,
    max_attempts: MASTER_ADMIN_OTP_MAX_ATTEMPTS,
    expires_at: expiresAt,
  })

  if (error) {
    throw new Error(`Failed to create Master Admin OTP challenge: ${error.message}`)
  }

  return code
}

export async function consumeMasterAdminOtpChallenge<TPayload = unknown>(
  admin: SupabaseClient<Database>,
  {
    email,
    code,
  }: {
    email: string
    code: string
  }
): Promise<{ userId: string; payload: TPayload } | null> {
  const normalizedEmail = email.toLowerCase()
  const { data, error } = await (admin as any)
    .schema("master_admin")
    .rpc("consume_master_admin_otp_challenge", {
      p_email: normalizedEmail,
      p_code_hash: hashCode(normalizedEmail, code),
    })
    .maybeSingle()

  if (error || !data?.user_id || !data?.encrypted_payload) {
    return null
  }

  return {
    userId: data.user_id as string,
    payload: decryptMasterAdminOtpPayload<TPayload>(data.encrypted_payload),
  }
}
