"use client"

import { useCallback, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Copy, FileText, Loader2 } from "lucide-react"
import { Button } from "@/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/components/card"
import { Input } from "@/ui/components/input"
import { Textarea } from "@/ui/components/textarea"
import { parseErrorResponse } from "@/core/http/client"

async function readSseText(response: Response, onChunk: (text: string) => void): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error("Failed to read streamed response")

  const decoder = new TextDecoder()
  let buffer = ""
  let fullText = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n\n")
    buffer = lines.pop() || ""

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue
      const data = JSON.parse(line.slice(6)) as { content?: string; done?: boolean; error?: string }
      if (data.error) throw new Error(data.error)
      if (data.done) return fullText
      if (typeof data.content === "string") {
        fullText += data.content
        onChunk(data.content)
      }
    }
  }

  return fullText
}

export default function DocumentsPage() {
  const [genre, setGenre] = useState("Drama")
  const [characters, setCharacters] = useState("")
  const [location, setLocation] = useState("")
  const [mood, setMood] = useState("")
  const [sceneDescription, setSceneDescription] = useState("")
  const [result, setResult] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const generateDocument = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsGenerating(true)
    setError(null)
    setResult("")
    setCopied(false)
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          genre,
          characters,
          location,
          mood,
          sceneDescription,
        }),
      })
      if (!res.ok) throw new Error(await parseErrorResponse(res, "Failed to generate document"))
      await readSseText(res, (chunk) => setResult((current) => current + chunk))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate document")
    } finally {
      setIsGenerating(false)
    }
  }

  const copyResult = useCallback(async () => {
    if (!result.trim()) return
    await navigator.clipboard.writeText(result)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }, [result])

  return (
    <main className="min-w-0 flex-1">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0a0a0a]/80 backdrop-blur-xl">
        <div className="pl-14 lg:pl-6 pr-6 py-4">
          <div className="flex items-center gap-4">
            <Button asChild variant="ghost" size="icon" className="text-muted-foreground hover:text-white">
              <Link href="/dashboard" aria-label="Back to dashboard">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold font-display text-white">Documents</h1>
              <p className="text-sm text-muted-foreground">Generate Tamil story drafts from structured inputs</p>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 p-6 lg:grid-cols-[minmax(20rem,26rem)_minmax(0,1fr)]">
        <Card className="border-white/10 bg-card/50">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cinematic-orange/20 bg-cinematic-orange/10">
                <FileText className="h-5 w-5 text-cinematic-orange" />
              </div>
              <div>
                <CardTitle className="text-lg text-white">Tamil story generator</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">Uses the protected documents AI route.</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {error ? (
              <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {error}
              </div>
            ) : null}
            <form onSubmit={generateDocument} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="document-genre" className="text-sm font-medium text-white">Genre</label>
                <Input
                  id="document-genre"
                  value={genre}
                  onChange={(event) => setGenre(event.target.value)}
                  maxLength={200}
                  className="border-white/10 bg-background/50 text-white"
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="document-characters" className="text-sm font-medium text-white">Characters</label>
                <Textarea
                  id="document-characters"
                  value={characters}
                  onChange={(event) => setCharacters(event.target.value)}
                  className="min-h-[100px] resize-y border-white/10 bg-background/50 text-white"
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="document-location" className="text-sm font-medium text-white">Location</label>
                <Input
                  id="document-location"
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  maxLength={10000}
                  className="border-white/10 bg-background/50 text-white"
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="document-mood" className="text-sm font-medium text-white">Mood</label>
                <Input
                  id="document-mood"
                  value={mood}
                  onChange={(event) => setMood(event.target.value)}
                  maxLength={2000}
                  className="border-white/10 bg-background/50 text-white"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="document-scene" className="text-sm font-medium text-white">Scene description</label>
                <Textarea
                  id="document-scene"
                  value={sceneDescription}
                  onChange={(event) => setSceneDescription(event.target.value)}
                  className="min-h-[140px] resize-y border-white/10 bg-background/50 text-white"
                  required
                />
              </div>
              <Button
                type="submit"
                disabled={isGenerating || !genre.trim() || !characters.trim() || !location.trim() || !sceneDescription.trim()}
                className="h-11 w-full bg-cinematic-orange text-black hover:bg-cinematic-orange/90"
              >
                {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Generate
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="min-h-[34rem] border-white/10 bg-card/50">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-lg text-white">Output</CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!result.trim()}
                className="border-white/10 bg-white/5 text-white/80"
                onClick={() => void copyResult()}
              >
                <Copy className="mr-2 h-4 w-4" />
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isGenerating && !result ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating...
              </div>
            ) : result ? (
              <div className="whitespace-pre-wrap rounded-xl border border-white/10 bg-black/20 p-4 text-sm leading-7 text-white/85">
                {result}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Generated story will appear here.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
