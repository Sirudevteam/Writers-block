"use client"

import Link from "next/link"
import {
  Clapperboard,
  Film,
  KeyRound,
  PenLine,
  ShieldCheck,
  Sparkles,
} from "lucide-react"

type AuthMode = "signin" | "signup"

interface AuthShellProps {
  mode: AuthMode
  children: React.ReactNode
}

export function AuthShell({ mode, children }: AuthShellProps) {
  const steps =
    mode === "signin"
      ? [
          { icon: KeyRound, label: "Password check" },
          { icon: ShieldCheck, label: "Email code" },
          { icon: Clapperboard, label: "Dashboard" },
        ]
      : [
          { icon: PenLine, label: "Profile" },
          { icon: ShieldCheck, label: "Verify email" },
          { icon: Clapperboard, label: "First draft" },
        ]

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#070706] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage: `
              linear-gradient(115deg, rgba(255,107,53,0.12) 0%, transparent 32%),
              linear-gradient(245deg, rgba(0,212,255,0.08) 0%, transparent 34%),
              linear-gradient(180deg, rgba(255,255,255,0.035) 0%, transparent 42%)
            `,
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.22) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.2) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          }}
        />
      </div>

      <div className="absolute left-0 right-0 top-0 flex h-3 justify-between px-1 opacity-[0.15]">
        {Array.from({ length: 40 }).map((_, i) => (
          <span key={i} className="h-full w-px rounded-full bg-white/40" />
        ))}
      </div>

      <Link
        href="/"
        className="absolute left-5 top-5 z-20 inline-flex items-center gap-3 rounded-lg px-2 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinematic-orange/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#060605] sm:left-8 sm:top-8"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-cinematic-orange shadow-lg shadow-cinematic-orange/15">
          <Film className="h-5 w-5 text-black" aria-hidden />
        </span>
        <span className="font-display text-lg font-semibold tracking-tight text-white/95">Writers Block</span>
      </Link>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col px-4 pb-16 pt-24 lg:flex-row lg:items-stretch lg:gap-12 lg:px-8 lg:pb-12 lg:pt-28">
        <aside className="mb-12 flex flex-1 animate-in fade-in slide-in-from-left-4 flex-col justify-center duration-500 lg:mb-0 lg:max-w-md lg:pr-4">
          <p className="mb-3 inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-cinematic-orange/90">
            <span className="inline-block h-px w-8 bg-cinematic-orange/60" aria-hidden />
            {mode === "signin" ? "Account" : "Join"}
          </p>
          <h1 className="font-display text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl">
            {mode === "signin" ? (
              <>
                Back to
                <span className="block text-cinematic-orange">your story.</span>
              </>
            ) : (
              <>
                Open your
                <span className="block text-cinematic-orange">next draft.</span>
              </>
            )}
          </h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-white/55">
            Professional AI-assisted screenwriting with plan-aware limits, secure sessions, and a workflow built for
            long-form scripts.
          </p>

          <div className="mt-9 grid grid-cols-3 gap-2 rounded-lg border border-white/[0.08] bg-black/20 p-2">
            {steps.map(({ icon: Icon, label }, index) => (
              <div key={label} className="min-w-0 rounded-md bg-white/[0.03] px-3 py-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <Icon className="h-4 w-4 text-cinematic-orange" aria-hidden />
                  <span className="font-mono text-[10px] text-white/30">0{index + 1}</span>
                </div>
                <p className="text-xs font-medium leading-snug text-white/70">{label}</p>
              </div>
            ))}
          </div>

          <ul className="mt-8 space-y-4">
            {[
              { icon: Clapperboard, text: "Scene-first editor tuned for screenplay structure" },
              { icon: PenLine, text: "Dialogue polish, continuations, and shot ideas" },
              { icon: Sparkles, text: "Plans that scale from exploration to production pace" },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex gap-3 text-sm text-white/65">
                <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-cinematic-orange">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="pt-1 leading-snug">{text}</span>
              </li>
            ))}
          </ul>

          <p className="mt-10 hidden border-l-2 border-white/10 pl-4 font-mono text-[13px] leading-relaxed text-white/35 lg:block">
            INT. WRITERS ROOM - NIGHT
            <br />
            <span className="text-white/45">The cursor blinks. The story waits.</span>
          </p>
        </aside>

        <div className="flex flex-1 items-center justify-center lg:justify-end">
          <div className="relative w-full max-w-[440px] animate-in fade-in slide-in-from-bottom-4 fill-mode-both delay-75 duration-500">
            <div
              className="absolute -inset-px rounded-lg bg-gradient-to-br from-cinematic-orange/35 via-white/5 to-cinematic-blue/25 opacity-70"
              aria-hidden
            />
            <div className="relative rounded-lg border border-white/[0.09] bg-[#0d0d0c]/95 p-7 shadow-2xl shadow-black/50 backdrop-blur-xl sm:p-9">
              {children}
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 flex h-3 justify-between px-1 opacity-[0.15]">
        {Array.from({ length: 40 }).map((_, i) => (
          <span key={i} className="h-full w-px rounded-full bg-white/40" />
        ))}
      </div>
    </div>
  )
}
