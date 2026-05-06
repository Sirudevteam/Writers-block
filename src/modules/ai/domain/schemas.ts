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

export const shotSuggestionSchema = z
  .object({
    shotNumber: z.number().int().min(1).max(100),
    shotType: z.string().trim().min(1).max(120),
    cameraAngle: z.string().trim().min(1).max(120),
    composition: z.string().trim().min(1).max(200),
    cameraMovement: z.string().trim().min(1).max(160),
    purpose: z.string().trim().min(1).max(240),
    description: z.string().trim().min(1).max(1_000),
  })
  .strict()

export const shotSuggestionsArraySchema = z.array(shotSuggestionSchema).min(1).max(8)

export const shotSuggestionsResponseSchema = z
  .object({
    shots: shotSuggestionsArraySchema,
  })
  .strict()

const movieReferenceCoreSchema = z
  .object({
    movie: z.string().trim().min(1).max(200),
    scene: z.string().trim().min(1).max(200),
    youtubeId: z.string().trim().regex(/^[a-zA-Z0-9_-]{6,20}$/),
    description: z.string().trim().min(1).max(1_000),
    matchReason: z.string().trim().min(1).max(1_000),
    emotion: z.string().trim().min(1).max(80),
    situation: z.string().trim().min(1).max(120),
    location: z.string().trim().min(1).max(120),
  })
  .strict()

export const movieReferenceAiSchema = movieReferenceCoreSchema
  .extend({
    thumbnail: z.string().url().max(2_000).optional(),
  })
  .strict()

export const movieReferenceSchema = movieReferenceCoreSchema
  .extend({
    thumbnail: z.string().url().max(2_000),
  })
  .strict()

export const movieReferencesAiArraySchema = z.array(movieReferenceAiSchema).min(1).max(5)

export const movieReferencesResponseSchema = z
  .object({
    references: z.array(movieReferenceSchema).min(1).max(5),
  })
  .strict()

export type ShotSuggestion = z.infer<typeof shotSuggestionSchema>
export type MovieReference = z.infer<typeof movieReferenceSchema>
