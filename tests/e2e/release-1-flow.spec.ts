import { expect, test, type APIResponse } from "@playwright/test"

const e2eSecret = process.env.E2E_TEST_SECRET ?? "local-e2e-secret"

function hasSupabaseEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

async function readSseText(response: APIResponse): Promise<string> {
  const raw = await response.text()
  return raw
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => JSON.parse(line.slice(6)))
    .map((event) => (typeof event.content === "string" ? event.content : ""))
    .join("")
}

test("E2E provider helper is secret-gated and reports deterministic mock mode", async ({ request }) => {
  const denied = await request.get("/api/test/e2e/provider")
  expect(denied.status()).toBe(401)

  const allowed = await request.get("/api/test/e2e/provider", {
    headers: { "x-e2e-test-secret": e2eSecret },
  })
  expect(allowed.ok()).toBeTruthy()
  await expect(allowed).toBeOK()
  const payload = await allowed.json()
  expect(payload).toMatchObject({
    ok: true,
    mockProviderEnabled: true,
    model: "e2e-deterministic",
  })
})

test.describe("authenticated Release 1 flow", () => {
  test.skip(!hasSupabaseEnv(), "Supabase env vars are required for authenticated E2E flows.")

  test("creates a project, edits Story Bible, generates with mock AI, and shows top-up history", async ({
    page,
    baseURL,
  }) => {
    const request = page.context().request
    const origin = baseURL ?? "http://127.0.0.1:3100"
    const email = `e2e-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`
    const password = "E2E-test-password-123"

    const session = await request.post("/api/test/e2e/session", {
      headers: { "x-e2e-test-secret": e2eSecret, Origin: origin },
      data: { email, password, fullName: "E2E Writer", plan: "pro" },
    })
    expect(session.ok()).toBeTruthy()

    const projectResponse = await request.post("/api/projects", {
      headers: { Origin: origin },
      data: {
        title: "E2E Last Ball",
        genre: "Sports drama",
        characters: "Meera - captain. Arjun - fast bowler.",
        location: "Chennai stadium",
        mood: "Tense",
        content: "FADE IN\n\n1. EXT - STADIUM - NIGHT\n\nMEERA watches the last ball.",
      },
    })
    expect(projectResponse.status()).toBe(201)
    const project = await projectResponse.json()
    const projectId = project.project.id as string

    const storyBible = await request.post(`/api/projects/${projectId}/story-bible`, {
      headers: { Origin: origin },
      data: {
        kind: "character",
        title: "Meera",
        content: "Meera is the captain and never lies to her team before the final ball.",
        pinned: true,
      },
    })
    expect(storyBible.status()).toBe(201)

    const topup = await request.post("/api/test/e2e/ai-credit-topup", {
      headers: { "x-e2e-test-secret": e2eSecret, Origin: origin },
    })
    expect(topup.ok()).toBeTruthy()

    const generate = await request.post("/api/generate", {
      headers: { Origin: origin, Accept: "text/event-stream" },
      data: {
        genre: "Sports drama",
        characters: "Meera - captain. Arjun - fast bowler.",
        location: "Chennai stadium",
        mood: "Tense",
        sceneDescription: "Meera guides Arjun before the last ball.",
        projectId,
      },
    })
    expect(generate.ok()).toBeTruthy()
    const generatedText = await readSseText(generate)
    expect(generatedText).toContain("E2E MOCK SCREENPLAY")
    expect(generatedText).toContain("Meera is the captain")

    await page.goto("/dashboard/subscription")
    await expect(page.getByText("1 AI credit = 1 total AI token used")).toBeVisible()
    await expect(page.getByText("AI credit top-up history")).toBeVisible()
    await expect(page.getByText("100K")).toBeVisible()
  })
})
