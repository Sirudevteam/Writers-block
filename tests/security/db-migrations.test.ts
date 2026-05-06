import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

const supabaseDir = join(process.cwd(), "supabase")
const schemaPath = join(supabaseDir, "database.sql")
const schemaSql = readFileSync(schemaPath, "utf8")

function listSqlFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) return listSqlFiles(fullPath)
    return entry.isFile() && entry.name.endsWith(".sql")
      ? [relative(process.cwd(), fullPath).replace(/\\/g, "/")]
      : []
  })
}

describe("database schema discipline", () => {
  it("keeps the Supabase schema as one SQL file", () => {
    expect(listSqlFiles(supabaseDir)).toEqual(["supabase/database.sql"])
  })

  it("keeps Story Bible schema in the consolidated schema", () => {
    expect(existsSync(schemaPath)).toBe(true)
    expect(schemaSql).toContain("CREATE TABLE IF NOT EXISTS public.project_story_bible_entries")
    expect(schemaSql).toContain("ALTER TABLE public.project_story_bible_entries ENABLE ROW LEVEL SECURITY")
    expect(schemaSql).toContain('CREATE POLICY "Org project readers can view story bible entries"')
    expect(schemaSql).toContain('CREATE POLICY "Org project writers can create story bible entries"')
    expect(schemaSql).toContain("CREATE INDEX IF NOT EXISTS project_story_bible_entries_project_kind_idx")
  })

  it("keeps AI credit admin visibility changes in the consolidated schema", () => {
    expect(schemaSql).toContain("CREATE INDEX IF NOT EXISTS ai_credit_reservations_status_created_idx")
    expect(schemaSql).toContain("COMMENT ON TABLE public.ai_credit_topup_purchases")
    expect(schemaSql).toContain("COMMENT ON TABLE public.ai_credit_reservations")
  })
})
