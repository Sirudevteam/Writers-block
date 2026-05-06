import type { ZodError, ZodType } from "zod"

type JsonBodyParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: 400; error: string }

export function zodErrorMessage(error: ZodError): string {
  const first = error.issues[0]
  return first
    ? `${first.path.length ? `${first.path.join(".")}: ` : ""}${first.message}`
    : "Invalid request body"
}

export async function parseJsonRequest<T>(
  request: Request,
  schema: ZodType<T>
): Promise<JsonBodyParseResult<T>> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return { ok: false, status: 400, error: "Invalid JSON body" }
  }

  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, status: 400, error: zodErrorMessage(parsed.error) }
  }

  return { ok: true, data: parsed.data }
}
