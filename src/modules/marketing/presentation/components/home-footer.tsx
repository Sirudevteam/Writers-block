"use client"

import { Film, ArrowUp, Heart, Mail, MapPin } from "lucide-react"
import Link from "next/link"
import { PLAN_LIMITS } from "@/shared/types/project"

const SIRU_AI_LABS_URL = "https://www.siruailabs.com/"

const CONTACT_HREF =
  process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim()
    ? `mailto:${process.env.NEXT_PUBLIC_CONTACT_EMAIL.trim()}`
    : SIRU_AI_LABS_URL

type FooterLink = {
  href: string
  label: string
  external?: boolean
}

const footerLinks: Record<"product" | "company" | "support" | "legal", FooterLink[]> = {
  product: [
    { href: "/#features", label: "Features" },
    { href: "/signup?next=/editor", label: "AI Scene Generator" },
    { href: "/signup?next=/editor", label: "Dialogue Improver" },
    { href: "/#pricing", label: "Pricing" },
  ],
  company: [
    { href: SIRU_AI_LABS_URL, label: "About Siru AI Labs", external: true },
    { href: SIRU_AI_LABS_URL, label: "Company news", external: true },
    { href: SIRU_AI_LABS_URL, label: "Careers", external: true },
    { href: CONTACT_HREF, label: "Contact", external: true },
  ],
  support: [
    { href: "/#faq", label: "Help & FAQ" },
    { href: "/#how-it-works", label: "How it works" },
    { href: "/signup", label: "Create account" },
    { href: "/signin", label: "Sign in" },
  ],
  legal: [
    { href: "/#faq-cookies", label: "Cookies & privacy" },
    { href: "/#faq-refunds", label: "Refunds & billing" },
  ],
}

function FooterStayConnected() {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cinematic-orange/15">
          <Mail className="h-4 w-4 text-cinematic-orange" aria-hidden />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Stay in the loop</p>
          <p className="text-xs text-muted-foreground">Product &amp; company updates</p>
        </div>
      </div>
      <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
        We do not run an email list from this footer yet. No fake signups here. Start writing with a free account, or
        follow Siru AI Labs for company news.
      </p>
      <div className="flex flex-col gap-2">
        <Link
          href="/signup"
          className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-cinematic-orange px-4 text-sm font-semibold text-black transition-colors hover:bg-cinematic-orange/90"
        >
          Create free account
        </Link>
        <a
          href={SIRU_AI_LABS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-center text-sm text-cinematic-orange underline-offset-2 hover:underline"
        >
          Visit Siru AI Labs
        </a>
      </div>
    </div>
  )
}

export function HomeFooter() {
  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" })

  const siruLinkClass =
    "text-cinematic-orange hover:text-cinematic-orange/90 underline-offset-2 hover:underline font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-cinematic-orange/50 focus-visible:rounded-sm"

  return (
    <footer role="contentinfo" className="bg-[#0a0a0a] border-t border-white/10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-14 pb-10">

        {/* Brand + nav + newsletter: aligned row on xl, stacked below */}
        <div className="flex flex-col gap-12 xl:flex-row xl:items-start xl:justify-between xl:gap-10">

          {/* Brand */}
          <div className="shrink-0 space-y-5 xl:w-[min(100%,17.5rem)]">
            <div className="flex items-center gap-3">
              <Link href="/" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cinematic-orange to-cinematic-orange/70 transition-opacity hover:opacity-90">
                <Film className="h-5 w-5 text-black" />
              </Link>
              <div className="min-w-0">
                <Link href="/" className="block text-lg font-bold leading-tight text-white transition-colors hover:text-white/90">
                  Writers Block
                </Link>
                <a
                  href={SIRU_AI_LABS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`text-xs ${siruLinkClass}`}
                >
                  by Siru AI Labs
                </a>
              </div>
            </div>

            <p className="text-sm leading-relaxed text-muted-foreground">
              AI screenplay writing for Tamil & English cinema. From first idea to professionally formatted script in minutes.
            </p>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4 shrink-0 text-cinematic-orange" aria-hidden />
              <span>Chennai, India</span>
            </div>
          </div>

          {/* Four equal link columns */}
          <div className="min-w-0 flex-1 xl:px-6">
            <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-4 sm:gap-x-8">
              {(["product", "company", "support", "legal"] as const).map((section) => (
                <div key={section} className="min-w-0">
                  <h3 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/55">
                    {section.charAt(0).toUpperCase() + section.slice(1)}
                  </h3>
                  <nav aria-label={`${section} links`} className="flex flex-col gap-2.5">
                    {footerLinks[section].map((link) =>
                      link.external ? (
                        <a
                          key={link.label}
                          href={link.href}
                          {...(link.href.startsWith("mailto:")
                            ? {}
                            : { target: "_blank" as const, rel: "noopener noreferrer" })}
                          className="text-sm text-muted-foreground transition-colors hover:text-white"
                        >
                          {link.label}
                        </a>
                      ) : (
                        <Link
                          key={link.label}
                          href={link.href}
                          className="text-sm text-muted-foreground transition-colors hover:text-white"
                        >
                          {link.label}
                        </Link>
                      )
                    )}
                  </nav>
                </div>
              ))}
            </div>
          </div>

          {/* Newsletter */}
          <div className="shrink-0 xl:w-[min(100%,20rem)] xl:max-w-xs">
            <FooterStayConnected />
          </div>
        </div>

        {/* Stats: equal columns, consistent rhythm */}
        <div className="mt-14 border-t border-white/[0.08] pt-10">
          <ul className="mx-auto grid max-w-4xl grid-cols-2 gap-8 md:max-w-none md:grid-cols-4 md:gap-6 lg:gap-8">
            {[
              { value: "2", label: "Languages: Tamil & English" },
              { value: String(PLAN_LIMITS.free), label: "Free lifetime project creations" },
              { value: "PDF", label: "Export for finished drafts" },
              { value: "AI", label: "Dialogue, scenes, and shots" },
            ].map((stat) => (
              <li key={stat.label} className="text-center md:border-l md:border-white/[0.06] md:pl-6 md:first:border-l-0 md:first:pl-0 lg:pl-8 lg:first:pl-0">
                <div className="text-2xl font-bold tabular-nums text-white">{stat.value}</div>
                <div className="mt-1.5 text-xs text-muted-foreground">{stat.label}</div>
              </li>
            ))}
          </ul>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 flex flex-col gap-4 border-t border-white/[0.08] pt-8 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <p className="text-center text-sm leading-relaxed text-muted-foreground sm:text-left text-balance">
            <span className="inline sm:block sm:inline">
              © {new Date().getFullYear()} Writers Block by{" "}
              <a
                href={SIRU_AI_LABS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={siruLinkClass}
              >
                Siru AI Labs
              </a>
            </span>
            <span className="mx-1.5 hidden text-white/25 sm:inline" aria-hidden>
              ·
            </span>
            <span className="mt-1 block sm:mt-0 sm:inline">
              Made with{" "}
              <Heart className="mx-0.5 inline h-3 w-3 fill-red-500 text-red-500 align-middle" aria-hidden />{" "}
              in India for Tamil &amp; English cinema
            </span>
          </p>

          <button
            type="button"
            onClick={scrollToTop}
            className="mx-auto flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:border-white/20 hover:text-white sm:mx-0"
          >
            Back to top
            <ArrowUp className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </div>
    </footer>
  )
}
