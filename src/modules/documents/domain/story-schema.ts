import { z } from "zod"

/** POST /api/documents — Tamil story generation request body */
export const tamilStoryRequestSchema = z
  .object({
    genre: z.string().trim().min(1, "genre is required").max(200),
    characters: z.string().trim().min(1, "characters is required").max(100_000),
    location: z.string().trim().min(1, "location is required").max(10_000),
    mood: z.string().trim().max(2000).optional(),
    sceneDescription: z
      .string()
      .trim()
      .min(1, "sceneDescription is required")
      .max(50_000),
  })
  .strict()
