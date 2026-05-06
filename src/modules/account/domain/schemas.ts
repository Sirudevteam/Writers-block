import { z } from "zod"

export const profileUpdateSchema = z
  .object({
    full_name: z.string().trim().max(120).nullable().optional(),
    bio: z.string().trim().max(1_000).nullable().optional(),
    avatar_url: z.string().url().max(2_000).nullable().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, "At least one field is required")

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>
