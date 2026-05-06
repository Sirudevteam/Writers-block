import PDFDocument from "pdfkit"
import { parseScreenplay } from "@/modules/editor/domain/screenplay-parse"
import { getScreenplayPdfFontPaths } from "@/modules/editor/infrastructure/screenplay-pdf-fonts"

const DEFAULT_SITE_URL = "https://writersblock.app"

const PAGE_W = 612
const PAGE_H = 792
const LEFT = 72 * 1.5
const RIGHT = 72
const WIDTH = PAGE_W - LEFT - RIGHT
const BODY_TOP = 104
const BODY_BOTTOM = PAGE_H - 92

const THEME = {
  black: "#050505",
  charcoal: "#0a0a0a",
  panel: "#111111",
  ink: "#000000",
  softInk: "#444444",
  paperLine: "#d9d9d9",
  orange: "#ff6b35",
  blue: "#00d4ff",
  white: "#ffffff",
  offWhite: "#f5f5f5",
} as const

type PdfFonts = {
  regular: string
  bold: string
}

function siteDisplayUrl(siteUrl: string): string {
  return siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")
}

function generatedDate(): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date())
}

function truncate(text: string, max = 92): string {
  const clean = text.replace(/\s+/g, " ").trim()
  return clean.length > max ? `${clean.slice(0, max - 3)}...` : clean
}

function drawCoverPage(
  doc: PDFKit.PDFDocument,
  title: string,
  displayUrl: string,
  fonts: PdfFonts,
  watermark: boolean
) {
  doc.rect(0, 0, PAGE_W, PAGE_H).fill(THEME.charcoal)

  doc.save()
  doc.opacity(0.9)
  doc.rect(0, 0, 16, PAGE_H).fill(THEME.orange)
  doc.rect(16, 0, 5, PAGE_H).fill(THEME.blue)
  doc.restore()

  doc.save()
  doc.opacity(0.18)
  doc.moveTo(PAGE_W - 168, 0).lineTo(PAGE_W, 0).lineTo(PAGE_W, 168).lineTo(PAGE_W - 168, 0).fill(THEME.blue)
  doc.moveTo(0, PAGE_H - 142).lineTo(142, PAGE_H).lineTo(0, PAGE_H).lineTo(0, PAGE_H - 142).fill(THEME.orange)
  doc.restore()

  doc.font("Helvetica-Bold").fontSize(10).fillColor(THEME.orange)
  doc.text("WRITERS BLOCK", 72, 86, { width: 220, characterSpacing: 1.2 })

  doc.font("Helvetica").fontSize(9).fillColor("#b8b8b8")
  doc.text("AI screenplay writing studio", 72, 106, { width: 240 })

  doc.moveTo(72, 150).lineTo(PAGE_W - 72, 150).strokeColor("#333333").lineWidth(0.8).stroke()
  doc.moveTo(72, 150).lineTo(232, 150).strokeColor(THEME.orange).lineWidth(2).stroke()
  doc.moveTo(232, 150).lineTo(318, 150).strokeColor(THEME.blue).lineWidth(2).stroke()

  doc.font(fonts.bold).fontSize(34).fillColor(THEME.white)
  doc.text(truncate(title, 70), 72, 238, {
    width: PAGE_W - 144,
    align: "left",
    lineGap: 8,
  })

  const titleBottom = Math.max(doc.y + 34, 392)
  doc.font("Helvetica").fontSize(11).fillColor("#bdbdbd")
  doc.text("Ready to download screenplay PDF", 72, titleBottom, { width: 300 })

  doc.font("Helvetica-Bold").fontSize(8).fillColor(THEME.black)
  doc.roundedRect(72, titleBottom + 42, 132, 24, 4).fill(THEME.orange)
  doc.fillColor(THEME.black).text(watermark ? "FREE PREVIEW" : "CLEAN EXPORT", 88, titleBottom + 50, {
    width: 100,
    align: "center",
    characterSpacing: 0.5,
  })

  doc.font("Helvetica").fontSize(9).fillColor("#9a9a9a")
  doc.text(`Generated ${generatedDate()}`, 72, PAGE_H - 150, { width: 220 })
  doc.text(displayUrl, 72, PAGE_H - 132, { width: 220 })

  doc.font("Helvetica").fontSize(8).fillColor("#707070")
  doc.text("Formatted for professional screenplay review and print-ready PDF sharing.", 72, PAGE_H - 96, {
    width: PAGE_W - 144,
  })

  if (watermark) {
    doc.save()
    doc.opacity(0.12)
    doc.font("Helvetica-Bold").fontSize(52).fillColor(THEME.white)
    doc.rotate(-28, { origin: [PAGE_W / 2, PAGE_H / 2] })
    doc.text("FREE PREVIEW", 106, 420, { width: 400, align: "center" })
    doc.restore()
  }
}

function drawBodyFurniture(
  doc: PDFKit.PDFDocument,
  title: string,
  displayUrl: string,
  pageNumber: number,
  totalPages: number
) {
  const shortTitle = truncate(title, 64)

  doc.save()
  doc.opacity(1)
  doc.moveTo(LEFT, 72).lineTo(PAGE_W - RIGHT, 72).strokeColor(THEME.paperLine).lineWidth(0.6).stroke()
  doc.moveTo(LEFT, 72).lineTo(LEFT + 96, 72).strokeColor(THEME.orange).lineWidth(1.8).stroke()
  doc.moveTo(LEFT + 96, 72).lineTo(LEFT + 148, 72).strokeColor(THEME.blue).lineWidth(1.8).stroke()

  doc.font("Helvetica-Bold").fontSize(8).fillColor(THEME.ink)
  doc.text("Writers Block", LEFT, 50, { width: 120 })
  doc.font("Helvetica").fontSize(8).fillColor(THEME.softInk)
  doc.text(shortTitle, LEFT + 120, 50, { width: WIDTH - 120, align: "right" })

  doc.moveTo(LEFT, PAGE_H - 58).lineTo(PAGE_W - RIGHT, PAGE_H - 58).strokeColor(THEME.paperLine).lineWidth(0.5).stroke()
  doc.font("Helvetica").fontSize(8).fillColor(THEME.softInk)
  doc.text(`Created with Writers Block | ${displayUrl}`, LEFT, PAGE_H - 44, {
    width: WIDTH / 2,
    align: "left",
  })
  doc.text(`Page ${pageNumber} of ${totalPages}`, LEFT + WIDTH / 2, PAGE_H - 44, {
    width: WIDTH / 2,
    align: "right",
  })
  doc.restore()
}

function drawWatermark(doc: PDFKit.PDFDocument) {
  doc.save()
  doc.opacity(0.075)
  doc.font("Helvetica-Bold").fontSize(46).fillColor("#6f6f6f")
  const cx = PAGE_W / 2
  const cy = PAGE_H / 2
  doc.rotate(-32, { origin: [cx, cy] })
  doc.text("Writers Block | Free preview", cx - 210, cy - 10, { width: 420, align: "center" })
  doc.restore()
}

/**
 * Branded screenplay PDF (letter size) with a cinematic cover page and
 * print-safe screenplay body pages.
 */
export async function buildScreenplayPdfBuffer(
  title: string,
  content: string,
  siteUrl: string = process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL,
  watermark: boolean = false
): Promise<Buffer> {
  const fontPaths = await getScreenplayPdfFontPaths()
  const fonts: PdfFonts = {
    regular: fontPaths.regular ? "WB-Body" : "Courier",
    bold: fontPaths.regular ? (fontPaths.bold ? "WB-Body-Bold" : "WB-Body") : "Courier-Bold",
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const doc = new PDFDocument({
      size: "LETTER",
      margin: 0,
      autoFirstPage: true,
      bufferPages: true,
      info: {
        Title: title,
        Author: "Writers Block",
        Subject: "Screenplay PDF",
        Creator: "Writers Block",
        Producer: "Writers Block",
      },
    })

    if (fontPaths.regular) {
      doc.registerFont("WB-Body", fontPaths.regular)
    }
    if (fontPaths.bold) {
      doc.registerFont("WB-Body-Bold", fontPaths.bold)
    }

    doc.on("data", (c: Buffer) => chunks.push(c))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)

    const display = siteDisplayUrl(siteUrl)
    drawCoverPage(doc, title, display, fonts, watermark)

    doc.addPage()
    let y = BODY_TOP

    const newBodyPage = () => {
      doc.addPage()
      y = BODY_TOP
    }

    const ensureSpace = (needed: number) => {
      if (y + needed > BODY_BOTTOM) {
        newBodyPage()
      }
    }

    doc.fillColor(THEME.ink)

    const lines = parseScreenplay(content)

    for (const line of lines) {
      switch (line.type) {
        case "empty":
          y += 10
          break

        case "scene-heading": {
          ensureSpace(38)
          doc.font(fonts.bold).fontSize(12).fillColor(THEME.ink)
          doc.text(line.text.toUpperCase(), LEFT, y, { width: WIDTH, lineGap: 2 })
          y = doc.y + 14
          break
        }

        case "transition": {
          ensureSpace(34)
          doc.font(fonts.bold).fontSize(12).fillColor(THEME.ink)
          doc.text(line.text.toUpperCase(), LEFT, y, { width: WIDTH, align: "right", lineGap: 2 })
          y = doc.y + 14
          break
        }

        case "character": {
          ensureSpace(30)
          doc.font(fonts.bold).fontSize(12).fillColor(THEME.ink)
          const cx = LEFT + 72 * 2.2
          doc.text(line.text.toUpperCase(), cx, y, { width: Math.max(80, PAGE_W - RIGHT - cx), lineGap: 2 })
          y = doc.y + 8
          break
        }

        case "parenthetical": {
          ensureSpace(28)
          doc.font(fonts.regular).fontSize(12).fillColor(THEME.ink)
          const px = LEFT + 72 * 1.6
          doc.text(line.text, px, y, { width: Math.max(80, PAGE_W - RIGHT - px), lineGap: 2 })
          y = doc.y + 6
          break
        }

        case "dialogue": {
          ensureSpace(42)
          doc.font(fonts.regular).fontSize(12).fillColor(THEME.ink)
          const dx = LEFT + 72
          const dWidth = WIDTH - (dx - LEFT) - 72
          doc.text(line.text, dx, y, { width: Math.max(80, dWidth), lineGap: 3 })
          y = doc.y + 12
          break
        }

        case "title": {
          ensureSpace(38)
          doc.font(fonts.bold).fontSize(14).fillColor(THEME.ink)
          doc.text(line.text, LEFT, y, { width: WIDTH, align: "center", lineGap: 2 })
          y = doc.y + 16
          break
        }

        default: {
          ensureSpace(42)
          doc.font(fonts.regular).fontSize(12).fillColor(THEME.ink)
          doc.text(line.text, LEFT, y, { width: WIDTH, lineGap: 3 })
          y = doc.y + 12
        }
      }
    }

    const range = doc.bufferedPageRange()
    const totalBodyPages = Math.max(1, range.count - 1)

    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i)
      if (i === range.start) continue

      const bodyPage = i - range.start
      drawBodyFurniture(doc, title, display, bodyPage, totalBodyPages)
      if (watermark) drawWatermark(doc)
    }

    doc.end()
  })
}
