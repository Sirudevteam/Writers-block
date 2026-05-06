import { z } from "zod"

/** Aligns with `projects.status` CHECK in supabase/database.sql. */
const projectStatusSchema = z.enum(["draft", "in_progress", "completed"])

const optionalText = (max: number) =>
  z
    .string()
    .max(max, `Must be at most ${max} characters`)
    .optional()
    .nullable()

/** POST /api/projects */
export const projectCreateBodySchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Title is required")
      .max(500, "Title must be at most 500 characters"),
    description: optionalText(50_000),
    genre: optionalText(200),
    characters: optionalText(100_000),
    location: optionalText(10_000),
    mood: optionalText(2000),
    content: optionalText(2_000_000),
    status: projectStatusSchema.optional().default("draft"),
  })
  .strict()

/** PUT /api/projects/[id] - all fields optional; reject unknown keys. */
export const projectUpdateBodySchema = z
  .object({
    title: z.string().trim().min(1).max(500).optional(),
    description: optionalText(50_000),
    genre: optionalText(200),
    characters: optionalText(100_000),
    location: optionalText(10_000),
    mood: optionalText(2000),
    content: optionalText(2_000_000),
    status: projectStatusSchema.optional(),
  })
  .strict()
  .refine(
    (data) => Object.keys(data).length > 0,
    "At least one field is required to update"
  )

export const projectIdParamSchema = z.object({
  id: z.string().uuid("Invalid project id"),
})

export type ProjectCreateBody = z.infer<typeof projectCreateBodySchema>
export type ProjectUpdateBody = z.infer<typeof projectUpdateBodySchema>
