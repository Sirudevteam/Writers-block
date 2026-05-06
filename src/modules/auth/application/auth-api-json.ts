import { NextResponse } from "next/server"

const AUTH_API_JSON_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
} as const

export function authApiJson(data: unknown, status: number) {
  return NextResponse.json(data, { status, headers: AUTH_API_JSON_HEADERS })
}
