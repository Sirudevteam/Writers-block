"use client"

import { useEffect, useRef, useMemo, useState, useCallback } from "react"
import { motion } from "framer-motion"
import { RotateCcw, Loader2, Pencil, FileDown, Film, Check, Mail } from "lucide-react"
import { Button } from "@/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/ui/components/dropdown-menu"
import { parseScreenplay, type ParsedLine } from "@/modules/editor/domain/screenplay-parse"
import { generatePrintHTML } from "@/modules/editor/domain/screenplay-print-html"

interface ScreenplayEditorProps {
  content: string
  isGenerating?: boolean
  onClear?: () => void
  onContentChange?: (content: string) => void
  title?: string
  /** When set, user can email a branded PDF to their registered address. */
  projectId?: string | null
  /** Free plan: add preview watermark to browser print / Save as PDF. */
  exportPrintWatermark?: boolean
  onWatermarkedPdfExport?: () => void
  onCleanPdfExport?: () => void | Promise<void>
  isCleanPdfExporting?: boolean
}

const DEFAULT_SITE_URL = "https://writersblock.app"

function ScreenplayLine({ line, index }: { line: ParsedLine; index: number }) {
  switch (line.type) {
    case "empty":
      return <div key={index} className="h-3" />
    case "scene-heading":
      return <p key={index} className="text-cinematic-orange font-bold text-sm">{line.text}</p>
    case "transition":
      return <p key={index} className="text-amber-400 text-sm text-right">{line.text}</p>
    case "character":
      return <p key={index} className="text-cinematic-blue font-semibold text-sm mt-4">{line.text}</p>
    case "parenthetical":
      return <p key={index} className="text-white/70 text-sm italic">{line.text}</p>
    case "dialogue":
      return <p key={index} className="text-white/90 text-sm">{line.text}</p>
    case "title":
      return <p key={index} className="text-white font-bold text-center text-lg my-4">{line.text}</p>
    case "action":
    default:
      return <p key={index} className="text-white/80 text-sm">{line.text}</p>
  }
}

function TypingCursor() {
  return (
    <motion.span
      className="inline-block w-[3px] h-[1.15em] bg-cinematic-orange ml-0.5 align-middle rounded-sm"
      animate={{ opacity: [1, 0, 1] }}
      transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut" }}
    />
  )
}

export function ScreenplayEditor({
  content,
  isGenerating = false,
  onClear,
  onContentChange,
  title = "Screenplay",
  projectId = null,
  exportPrintWatermark = false,
  onWatermarkedPdfExport,
  onCleanPdfExport,
  isCleanPdfExporting = false,
}: ScreenplayEditorProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const previousContentLength = useRef(0)
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(content)
  const [emailSending, setEmailSending] = useState(false)
  const currentText = isEditing ? editValue : content

  useEffect(() => {
    if (!isEditing) setEditValue(content)
  }, [content, isEditing])

  useEffect(() => {
    if (scrollRef.current && content.length > previousContentLength.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
    previousContentLength.current = content.length
  }, [content])

  const parsedLines = useMemo(() => {
    if (isGenerating && !isEditing) return []
    return parseScreenplay(currentText)
  }, [currentText, isEditing, isGenerating])

  const wordCount = useMemo(() => {
    const trimmed = currentText.trim()
    return trimmed ? trimmed.split(/\s+/).length : 0
  }, [currentText])
  const pageEstimate = Math.max(1, Math.ceil(wordCount / 250))

  const handleEditSave = useCallback(() => {
    onContentChange?.(editValue)
    setIsEditing(false)
  }, [editValue, onContentChange])

  const handleEditCancel = useCallback(() => {
    setEditValue(content)
    setIsEditing(false)
  }, [content])

  // Professional PDF Export (browser print → Save as PDF)
  const handleExportPDF = useCallback(() => {
    if (!content.trim()) return

    const printWindow = window.open('', '_blank', 'width=850,height=1100')
    if (!printWindow) {
      alert('Please allow popups to export PDF')
      return
    }

    const siteUrl =
      typeof process.env.NEXT_PUBLIC_SITE_URL === "string" && process.env.NEXT_PUBLIC_SITE_URL
        ? process.env.NEXT_PUBLIC_SITE_URL
        : DEFAULT_SITE_URL

    const html = generatePrintHTML(content, title, siteUrl, exportPrintWatermark)
    printWindow.document.open()
    printWindow.document.write(html)
    printWindow.document.close()

    // `load` often never fires after document.write; printing too early yields a blank PDF.
    // Defer until after layout/paint (double rAF + delay).
    const runPrint = () => {
      try {
        printWindow.focus()
        printWindow.print()
      } catch {
        /* ignore */
      }
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.setTimeout(runPrint, 350)
      })
    })
  }, [content, title, exportPrintWatermark])

  const handleEmailPdf = useCallback(async () => {
    if (!projectId || !content.trim()) return
    setEmailSending(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/send-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ content }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
      if (!res.ok) {
        alert(typeof data.error === "string" ? data.error : "Could not send email.")
        return
      }
      alert(typeof data.message === "string" ? data.message : "PDF sent to your email.")
    } catch {
      alert("Network error. Try again.")
    } finally {
      setEmailSending(false)
    }
  }, [projectId, content])

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="h-full flex flex-col"
    >
      {/* Editor Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-[#0a0a0a]/50">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-white">Screenplay</h2>
        </div>

        <div className="flex items-center gap-2">
          {isGenerating && (
            <div className="flex items-center gap-2 text-cinematic-orange">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span className="text-xs">Writing...</span>
            </div>
          )}
          
          {content && !isGenerating && (
            <>
              {isEditing ? (
                <>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={handleEditCancel} 
                    className="h-8 text-xs text-white/70 hover:text-white"
                  >
                    Cancel
                  </Button>
                  <Button 
                    size="sm" 
                    onClick={handleEditSave} 
                    className="h-8 text-xs bg-cinematic-orange text-black hover:bg-cinematic-orange/90"
                  >
                    <Check className="w-3.5 h-3.5 mr-1" />
                    Save
                  </Button>
                </>
              ) : (
                <>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setIsEditing(true)} 
                    className="h-8 text-xs text-white/70 hover:text-white"
                  >
                    <Pencil className="w-3.5 h-3.5 mr-1" />
                    Edit
                  </Button>
                  {exportPrintWatermark ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs text-white/70 hover:text-white"
                          title="Choose PDF export option"
                        >
                          {isCleanPdfExporting ? (
                            <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                          ) : (
                            <FileDown className="w-3.5 h-3.5 mr-1" />
                          )}
                          Export PDF
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuItem
                          onSelect={(event) => {
                            event.preventDefault()
                            const exportWatermarked = onWatermarkedPdfExport ?? handleExportPDF
                            exportWatermarked()
                          }}
                          className="gap-2 text-xs"
                        >
                          <FileDown className="h-3.5 w-3.5" />
                          Watermarked PDF - Free
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={!onCleanPdfExport || isCleanPdfExporting}
                          onSelect={(event) => {
                            event.preventDefault()
                            void onCleanPdfExport?.()
                          }}
                          className="gap-2 text-xs"
                        >
                          {isCleanPdfExporting ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <FileDown className="h-3.5 w-3.5" />
                          )}
                          Clean PDF - ₹99
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleExportPDF}
                      className="h-8 text-xs text-white/70 hover:text-white"
                      title="Export to PDF"
                    >
                      <FileDown className="w-3.5 h-3.5 mr-1" />
                      Export PDF
                    </Button>
                  )}
                  {projectId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleEmailPdf}
                      disabled={emailSending}
                      className="h-8 text-xs text-white/70 hover:text-white"
                      title="Email PDF to your registered address"
                    >
                      {emailSending ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Mail className="w-3.5 h-3.5 mr-1" />
                      )}
                      <span className="hidden sm:inline">Email PDF</span>
                    </Button>
                  )}
                  {onClear && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={onClear} 
                      className="h-8 text-xs text-red-400 hover:text-red-300"
                    >
                      <RotateCcw className="w-3.5 h-3.5 mr-1" />
                      Clear
                    </Button>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Editor Content */}
      <div className="flex-1 overflow-hidden bg-[#0f0f0f]">
        <div 
          ref={scrollRef}
          className="h-full overflow-y-auto p-4 sm:p-6"
        >
          {isEditing ? (
            <textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="w-full min-h-[60vh] bg-transparent text-white/90 text-sm font-mono resize-none outline-none leading-relaxed"
              spellCheck={false}
              autoFocus
            />
          ) : isGenerating ? (
            <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-relaxed text-white/85">
              {content}
              <TypingCursor />
            </pre>
          ) : content ? (
            <div className="space-y-1">
              {parsedLines.map((line, index) => (
                <ScreenplayLine key={index} line={line} index={index} />
              ))}
            </div>
          ) : (
            <EmptyState />
          )}
        </div>
      </div>

      {/* Footer Stats */}
      <div className="px-4 py-2 border-t border-white/10 bg-[#0a0a0a]/50 flex items-center justify-between text-xs text-white/50">
        <div className="flex items-center gap-4">
          <span>{wordCount} words</span>
          <span>~{pageEstimate} {pageEstimate === 1 ? "page" : "pages"}</span>
        </div>
        <span>{content ? content.length : 0} characters</span>
      </div>
    </motion.div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground select-none">
      <div className="relative">
        <div className="absolute -inset-8 bg-gradient-to-r from-cinematic-orange/20 via-transparent to-cinematic-blue/20 rounded-full blur-2xl opacity-30" />
        <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 flex items-center justify-center mb-6">
          <Film className="w-10 h-10 text-white/40" />
        </div>
      </div>
      <h3 className="text-lg font-semibold text-white/80 mb-2">
        Your screenplay will appear here
      </h3>
      <p className="text-sm text-muted-foreground text-center max-w-sm mb-6">
        Configure your scene details on the left and click Generate Scene to start writing
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        {[
          { icon: "💡", text: "Be specific with details" },
          { icon: "🎬", text: "Include location info" },
          { icon: "✍️", text: "Describe the scene" },
        ].map((tip) => (
          <div key={tip.text} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
            <span>{tip.icon}</span>
            <span className="text-xs text-white/60">{tip.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
