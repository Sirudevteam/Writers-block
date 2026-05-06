export async function parseErrorResponse(
  response: Response,
  fallback = "Request failed"
): Promise<string> {
  try {
    const body = await response.json()
    if (typeof body?.error === "string") {
      return body.error
    }
  } catch {
    /* ignore non-JSON responses */
  }

  return response.statusText || fallback
}
