import { z } from "zod"

export const storyBibleKindSchema = z.enum(["character", "scene", "arc", "continuity_note", "style_rule"])

export const storyBibleCreateSchema = z
  .object({
    kind: storyBibleKindSchema,
    title: z.string().trim().min(1, "Title is required").max(160, "Title must be at most 160 characters"),
    content: z.string().trim().min(1, "Content is required").max(8000, "Content must be at most 8000 characters"),
    pinned: z.boolean().optional().default(false),
  })
  .strict()

export const storyBibleUpdateSchema = z
  .object({
    kind: storyBibleKindSchema.optional(),
    title: z.string().trim().min(1).max(160).optional(),
    content: z.string().trim().min(1).max(8000).optional(),
    pinned: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, "At least one field is required to update")

export const storyBibleEntryIdParamSchema = z.object({
  id: z.string().uuid("Invalid project id"),
  entryId: z.string().uuid("Invalid Story Bible entry id"),
})

export type StoryBibleCreateBody = z.infer<typeof storyBibleCreateSchema>
export type StoryBibleUpdateBody = z.infer<typeof storyBibleUpdateSchema>
