"use client"

import { motion } from "framer-motion"
import { useAccessibility } from "@/shared/components/accessibility-provider"

type PreviewLine = {
  text: string
  type: "heading" | "action" | "character" | "paren" | "dialogue"
  lang: "en" | "ta"
}

const lines: PreviewLine[] = [
  { text: "INT. CAFE - EVENING", type: "heading", lang: "en" },
  {
    text: "மழை பெய்துகொண்டிருக்கிறது. அருண் ஜன்னல் அருகே நிற்கிறான்.",
    type: "action",
    lang: "ta",
  },
  {
    text: "Rain falls gently. Arun stands by the window, lost in thought.",
    type: "action",
    lang: "en",
  },
  { text: "ARUN", type: "character", lang: "en" },
  { text: "(வருத்தத்துடன்)", type: "paren", lang: "ta" },
  { text: "எனக்கு இன்னும் நேரம் வேண்டும்...", type: "dialogue", lang: "ta" },
]

function ScreenplayMockup() {
  const { prefersReducedMotion } = useAccessibility()

  return (
    <motion.div
      {...(prefersReducedMotion
        ? { initial: false }
        : {
            initial: { opacity: 0, y: 20, rotateX: 10 },
            whileInView: { opacity: 1, y: 0, rotateX: 0 },
            viewport: { once: true },
            transition: { duration: 0.8, delay: 0.15 },
          })}
      className="relative mx-auto w-full max-w-2xl perspective-1000"
    >
      <div className="absolute -inset-1 rounded-xl bg-gradient-to-r from-cinematic-orange/20 to-cinematic-blue/20 opacity-50 blur-xl" />

      <div className="relative overflow-hidden rounded-xl border border-white/10 bg-[#0d0d0d] shadow-2xl">
        <div className="flex items-center gap-2 border-b border-white/5 bg-white/[0.02] px-4 py-3">
          <div className="flex gap-1.5" aria-hidden="true">
            <div className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
            <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/80" />
            <div className="h-2.5 w-2.5 rounded-full bg-green-500/80" />
          </div>
          <span className="ml-3 font-mono text-xs text-muted-foreground">screenplay.scene</span>
        </div>

        <div className="min-h-[180px] space-y-2 p-5 font-mono text-sm sm:p-6 sm:text-base">
          {lines.map((line, index) => {
            const lineClass =
              line.type === "heading"
                ? "font-bold uppercase text-cinematic-orange"
                : line.type === "character"
                  ? "mt-3 text-center text-cinematic-blue"
                  : line.type === "paren"
                    ? "text-center text-xs italic text-white/50 sm:text-sm"
                    : line.type === "dialogue"
                      ? "ml-6 border-l-2 border-cinematic-orange/30 pl-3 text-white sm:ml-10"
                      : "text-white/70"

            return (
              <div key={index} className={lineClass} lang={line.lang}>
                {line.text}
              </div>
            )
          })}
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-[#0d0d0d] to-transparent" />
      </div>

      <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-cinematic-orange px-3 py-1 text-xs font-bold text-black">
        AI Generated
      </div>
    </motion.div>
  )
}

export function HomeScreenplayPreviewSection() {
  return (
    <section
      id="writers-block-workflow"
      aria-label="How Writers Block works"
      className="relative overflow-hidden bg-white/[0.02] px-4 py-24 sm:px-6 lg:px-8"
    >
      <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cinematic-orange/5 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-12 text-center"
        >
          <span className="mb-3 inline-block rounded-full border border-cinematic-blue/20 bg-cinematic-blue/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-cinematic-blue">
            How Writers Block Works
          </span>
          <h2 className="mb-4 font-display text-3xl font-bold text-white sm:text-4xl lg:text-5xl">
            Your idea becomes a{" "}
            <span className="bg-gradient-to-r from-cinematic-orange to-cinematic-blue bg-clip-text text-transparent">
              formatted scene
            </span>
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            Start with a scene beat, choose the mood and language, then refine the generated draft into pages you can
            share or export.
          </p>
        </motion.div>

        <ScreenplayMockup />
      </div>
    </section>
  )
}
