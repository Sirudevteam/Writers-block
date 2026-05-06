import { z } from "zod"

const text = (max: number) => z.string().trim().min(1).max(max)
const optionalText = (max: number) => z.string().trim().max(max).optional().nullable()
const optionalProjectId = z.string().uuid().optional().nullable()

export const generateScreenplaySchema = z
  .object({
    genre: text(200),
    characters: text(100_000),
    location: text(10_000),
    mood: optionalText(2_000),
    sceneDescription: text(100_000),
    projectId: optionalProjectId,
  })
  .strict()

export const screenplayOnlySchema = z
  .object({
    screenplay: z.string().trim().min(50).max(600_000),
    projectId: optionalProjectId,
  })
  .strict()

export const continueScreenplaySchema = z
  .object({
    screenplay: z.string().trim().min(100).max(600_000),
    genre: optionalText(200),
    characters: optionalText(100_000),
    mood: optionalText(2_000),
    projectId: optionalProjectId,
  })
  .strict()

export const rewriteStyleSchema = z
  .object({
    screenplay: z.string().trim().min(80).max(600_000),
    styleId: z.string().trim().max(80).optional(),
    projectId: optionalProjectId,
  })
  .strict()

export const movieReferencesSchema = z
  .object({
    screenplay: z.string().trim().min(50).max(600_000),
    genre: optionalText(200),
    mood: optionalText(2_000),
    characters: optionalText(100_000),
    location: optionalText(10_000),
    projectId: optionalProjectId,
  })
  .strict()

export const sendPdfSchema = z
  .object({
    content: z.string().max(600_000).optional(),
  })
  .strict()
