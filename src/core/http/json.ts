import { NextResponse } from "next/server"
import type { ZodError } from "zod"
import { zodErrorMessage } from "@/core/http/validation"

export function jsonError(
  message: string,
  status = 500,
  headers?: HeadersInit
): NextResponse<{ error: string }> {
  return NextResponse.json({ error: message }, { status, headers })
}

/**
 * Safe 400 for Zod validation: first issue only, no stack or raw input.
 */
export function zodErrorJsonResponse(
  error: ZodError,
  headers?: HeadersInit
): NextResponse<{ error: string }> {
  return jsonError(zodErrorMessage(error), 400, headers)
}
