import fs from "fs"
import path from "path"
import os from "os"

const CACHE_DIR = path.join(os.tmpdir(), "writersblock-pdf-fonts")

const FONT_SOURCES = {
  regular:
    "https://raw.githubusercontent.com/googlefonts/noto-fonts/main/hinted/ttf/NotoSansTamil/NotoSansTamil-Regular.ttf",
  bold: "https://raw.githubusercontent.com/googlefonts/noto-fonts/main/hinted/ttf/NotoSansTamil/NotoSansTamil-Bold.ttf",
} as const

async function downloadIfMissing(filename: string, url: string): Promise<string | null> {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true })
    const dest = path.join(CACHE_DIR, filename)
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
      return dest
    }
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), 25_000)
    const res = await fetch(url, { signal: ac.signal }).finally(() => clearTimeout(timer))
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length < 1000) return null
    fs.writeFileSync(dest, buf)
    return dest
  } catch {
    return null
  }
}

/** TTF paths for Tamil + Latin body text; nulls fall back to PDF built-ins. */
export async function getScreenplayPdfFontPaths(): Promise<{
  regular: string | null
  bold: string | null
}> {
  const [regular, bold] = await Promise.all([
    downloadIfMissing("NotoSansTamil-Regular.ttf", FONT_SOURCES.regular),
    downloadIfMissing("NotoSansTamil-Bold.ttf", FONT_SOURCES.bold),
  ])
  return { regular, bold }
}
