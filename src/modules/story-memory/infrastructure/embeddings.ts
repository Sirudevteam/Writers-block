import { OpenAIEmbeddings } from "@langchain/openai"

let embeddingsClient: OpenAIEmbeddings | null = null

export function storyMemoryEmbeddingModel(): string {
  return process.env.AI_EMBEDDING_MODEL?.trim() || "text-embedding-3-small"
}

export function storyMemoryEmbeddingDimensions(): number {
  const raw = Number(process.env.AI_EMBEDDING_DIMENSIONS)
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 1536
}

function getEmbeddingsClient(): OpenAIEmbeddings {
  if (embeddingsClient) return embeddingsClient
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for story memory embeddings.")
  }

  embeddingsClient = new OpenAIEmbeddings({
    apiKey,
    model: storyMemoryEmbeddingModel(),
    dimensions: storyMemoryEmbeddingDimensions(),
    batchSize: 64,
    stripNewLines: false,
  })
  return embeddingsClient
}

export async function embedStoryQuery(text: string): Promise<number[]> {
  return getEmbeddingsClient().embedQuery(text)
}

export async function embedStoryDocuments(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []
  return getEmbeddingsClient().embedDocuments(texts)
}

export function vectorToSqlLiteral(vector: number[]): string {
  return `[${vector.map((value) => (Number.isFinite(value) ? value : 0)).join(",")}]`
}
