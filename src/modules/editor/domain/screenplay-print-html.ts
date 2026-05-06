import { parseScreenplay } from "@/modules/editor/domain/screenplay-parse"

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

const DEFAULT_SITE_URL = "https://writersblock.app"

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

/** HTML document for browser print / Save as PDF (matches branded PDFKit template). */
export function generatePrintHTML(
  content: string,
  title: string = "Screenplay",
  siteUrl: string = DEFAULT_SITE_URL,
  watermark: boolean = false
): string {
  const html: string[] = []
  for (const line of parseScreenplay(content)) {
    switch (line.type) {
      case "empty":
        html.push('<div class="spacer"></div>')
        break
      case "scene-heading":
        html.push(`<p class="sh">${escapeHtml(line.text)}</p>`)
        break
      case "transition":
        html.push(`<p class="tr">${escapeHtml(line.text)}</p>`)
        break
      case "parenthetical":
        html.push(`<p class="pa">${escapeHtml(line.text)}</p>`)
        break
      case "dialogue":
        html.push(`<p class="dl">${escapeHtml(line.text)}</p>`)
        break
      case "character":
        html.push(`<p class="ch">${escapeHtml(line.text)}</p>`)
        break
      case "title":
        html.push(`<p class="tl">${escapeHtml(line.text)}</p>`)
        break
      default:
        html.push(`<p class="ac">${escapeHtml(line.text)}</p>`)
    }
  }

  const displayUrl = siteDisplayUrl(siteUrl)
  const escapedTitle = escapeHtml(title)
  const escapedDisplayUrl = escapeHtml(displayUrl)
  const date = generatedDate()

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapedTitle} - Writers Block</title>
  <style>
    @page {
      size: letter;
      margin: 0;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    html,
    body {
      min-height: 100%;
      background: #ffffff !important;
      color: #000000 !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    body {
      font-family: "Courier New", Courier, "Courier Prime", monospace;
      font-size: 12pt;
      line-height: 1.5;
    }

    .print-cover {
      position: relative;
      width: 8.5in;
      min-height: 11in;
      overflow: hidden;
      page-break-after: always;
      background: #0a0a0a;
      color: #ffffff;
      font-family: system-ui, "Segoe UI", sans-serif;
      padding: 0.95in 1in;
    }

    .cover-left-bar {
      position: absolute;
      inset: 0 auto 0 0;
      width: 0.22in;
      background: #ff6b35;
    }

    .cover-left-blue {
      position: absolute;
      inset: 0 auto 0 0.22in;
      width: 0.07in;
      background: #00d4ff;
    }

    .cover-mark-a,
    .cover-mark-b {
      position: absolute;
      width: 1.9in;
      height: 1.9in;
      opacity: 0.18;
      transform: rotate(45deg);
    }

    .cover-mark-a {
      right: -0.65in;
      top: -0.65in;
      background: #00d4ff;
    }

    .cover-mark-b {
      left: -0.75in;
      bottom: -0.75in;
      background: #ff6b35;
    }

    .cover-brand {
      position: relative;
      z-index: 1;
      color: #ff6b35;
      font-size: 10pt;
      font-weight: 800;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }

    .cover-sub {
      position: relative;
      z-index: 1;
      margin-top: 0.12in;
      color: #b8b8b8;
      font-size: 9pt;
    }

    .cover-line {
      position: relative;
      z-index: 1;
      margin-top: 0.45in;
      height: 2pt;
      width: 5.3in;
      background: linear-gradient(90deg, #ff6b35 0 35%, #00d4ff 35% 54%, #333333 54% 100%);
    }

    .cover-title {
      position: relative;
      z-index: 1;
      margin-top: 1.05in;
      max-width: 6.1in;
      color: #ffffff;
      font-size: 34pt;
      line-height: 1.1;
      font-weight: 800;
      letter-spacing: 0;
      overflow-wrap: break-word;
    }

    .cover-ready {
      position: relative;
      z-index: 1;
      margin-top: 0.38in;
      color: #bdbdbd;
      font-size: 11pt;
    }

    .cover-pill {
      position: relative;
      z-index: 1;
      display: inline-block;
      margin-top: 0.4in;
      min-width: 1.35in;
      border-radius: 4pt;
      background: #ff6b35;
      color: #050505;
      padding: 7pt 12pt;
      font-size: 8pt;
      font-weight: 800;
      text-align: center;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }

    .cover-meta {
      position: absolute;
      left: 1in;
      right: 1in;
      bottom: 1.1in;
      z-index: 1;
      color: #9a9a9a;
      font-size: 9pt;
      line-height: 1.6;
    }

    .cover-note {
      margin-top: 0.25in;
      color: #707070;
      font-size: 8pt;
    }

    .print-body {
      position: relative;
      min-height: 11in;
      padding: 1.45in 1in 1.25in 1.5in;
      background: #ffffff;
      color: #000000;
    }

    .body-header {
      position: fixed;
      top: 0.55in;
      left: 1.5in;
      right: 1in;
      height: 0.28in;
      border-bottom: 0.6pt solid #d9d9d9;
      font-family: system-ui, "Segoe UI", sans-serif;
      color: #000000;
      z-index: 2;
    }

    .body-header::before {
      content: "";
      position: absolute;
      left: 0;
      bottom: -1.2pt;
      width: 1.35in;
      height: 1.8pt;
      background: linear-gradient(90deg, #ff6b35 0 65%, #00d4ff 65% 100%);
    }

    .body-brand {
      float: left;
      font-size: 8pt;
      font-weight: 800;
      color: #000000;
    }

    .body-title {
      float: right;
      max-width: 4.6in;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      text-align: right;
      font-size: 8pt;
      color: #444444;
    }

    .print-footer {
      position: fixed;
      bottom: 0.48in;
      left: 1.5in;
      right: 1in;
      border-top: 0.5pt solid #d9d9d9;
      padding-top: 8pt;
      font-family: system-ui, "Segoe UI", sans-serif;
      font-size: 8pt;
      color: #444444;
      z-index: 2;
    }

    .print-footer .left {
      float: left;
    }

    .print-footer .right {
      float: right;
    }

    .screenplay-print-body {
      position: relative;
      z-index: 1;
    }

    p {
      margin-bottom: 0;
      color: #000000 !important;
    }

    .spacer {
      height: 12px;
    }

    .sh {
      margin-top: 24pt;
      margin-bottom: 12pt;
      font-weight: bold;
      text-transform: uppercase;
      page-break-after: avoid;
    }

    .ac {
      margin-bottom: 12pt;
      page-break-inside: avoid;
    }

    .ch {
      margin-top: 12pt;
      margin-bottom: 0;
      margin-left: 2.2in;
      font-weight: bold;
      text-transform: uppercase;
      page-break-after: avoid;
    }

    .pa {
      margin-left: 1.6in;
      margin-bottom: 0;
      font-style: italic;
      page-break-after: avoid;
    }

    .dl {
      margin-left: 1in;
      margin-right: 1in;
      margin-bottom: 12pt;
      page-break-inside: avoid;
    }

    .tr {
      margin-top: 12pt;
      margin-bottom: 12pt;
      text-align: right;
      text-transform: uppercase;
      page-break-after: avoid;
    }

    .tl {
      text-align: center;
      font-weight: bold;
      font-size: 14pt;
      margin: 16pt 0;
    }

    .print-wm {
      position: fixed;
      inset: 0;
      z-index: 0;
      pointer-events: none;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .print-wm span {
      font-family: system-ui, "Segoe UI", sans-serif;
      font-size: 46pt;
      font-weight: 900;
      color: rgba(0, 0, 0, 0.075);
      transform: rotate(-32deg);
      user-select: none;
      text-align: center;
    }

    @media print {
      html,
      body,
      .print-body {
        background: #ffffff !important;
        color: #000000 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      .print-cover {
        background: #0a0a0a !important;
        color: #ffffff !important;
      }

      p {
        color: #000000 !important;
      }
    }
  </style>
</head>
<body>
  <section class="print-cover">
    <div class="cover-left-bar" aria-hidden="true"></div>
    <div class="cover-left-blue" aria-hidden="true"></div>
    <div class="cover-mark-a" aria-hidden="true"></div>
    <div class="cover-mark-b" aria-hidden="true"></div>
    <div class="cover-brand">Writers Block</div>
    <div class="cover-sub">AI screenplay writing studio</div>
    <div class="cover-line" aria-hidden="true"></div>
    <h1 class="cover-title">${escapedTitle}</h1>
    <div class="cover-ready">Ready to download screenplay PDF</div>
    <div class="cover-pill">${watermark ? "Free preview" : "Clean export"}</div>
    <div class="cover-meta">
      <div>Generated ${escapeHtml(date)}</div>
      <div>${escapedDisplayUrl}</div>
      <div class="cover-note">Formatted for professional screenplay review and print-ready PDF sharing.</div>
    </div>
  </section>

  ${watermark ? '<div class="print-wm" aria-hidden="true"><span>Writers Block | Free preview</span></div>' : ""}
  <main class="print-body">
    <header class="body-header">
      <span class="body-brand">Writers Block</span>
      <span class="body-title">${escapedTitle}</span>
    </header>
    <div class="screenplay-print-body">
${html.join("\n")}
    </div>
    <footer class="print-footer">
      <span class="left">Created with Writers Block | ${escapedDisplayUrl}</span>
      <span class="right">Ready to download</span>
    </footer>
  </main>
</body>
</html>`
}
