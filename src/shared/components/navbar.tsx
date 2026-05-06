"use client"

import { motion, AnimatePresence, useScroll, useMotionValueEvent, useMotionValue } from "framer-motion"
import { Film, Menu, X, Sparkles, Pen, LayoutDashboard, FolderOpen, CreditCard } from "lucide-react"
import Link from "next/link"
import { useState, useEffect, useCallback } from "react"
import { Button } from "@/ui/components/button"
import { useRouter, usePathname } from "next/navigation"

// Type definitions for nav links
type NavLink = {
  href: string
  label: string
  icon?: React.ComponentType<{ className?: string }>
  highlight?: boolean
}

// Nav links for unauthenticated visitors (conversion-focused)
const guestNavLinks: NavLink[] = [
  { href: "/", label: "Home" },
  { href: "/#features", label: "Features" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/signup?next=/editor", label: "Try Editor", highlight: true },
]

// Nav links for authenticated users (usage-focused)
const authNavLinks: NavLink[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/editor", label: "Editor", icon: Pen, highlight: true },
  { href: "/dashboard/projects", label: "Projects", icon: FolderOpen },
]

function readLocationHash() {
  if (typeof window === "undefined") return ""
  return window.location.hash || ""
}

/** Pathname + hash so / vs /#features vs /#pricing only one nav item is active. */
function isNavLinkActive(href: string, pathname: string, hash: string) {
  if (href === "/") {
    if (pathname !== "/") return false
    const h = hash || ""
    return h === "" || h === "#"
  }
  if (href.startsWith("/#")) {
    if (pathname !== "/") return false
    return hash === href.slice(1)
  }
  if (href.startsWith("/signup?")) {
    return pathname === "/signup"
  }
  if (href === "/editor") return pathname === "/editor"
  return pathname.startsWith(href)
}

// Magnetic link component
function MagneticLink({ 
  href, 
  children, 
  active,
  highlight = false,
}: { 
  href: string; 
  children: React.ReactNode; 
  active: boolean;
  highlight?: boolean;
}) {
  const x = useMotionValue(0)
  const y = useMotionValue(0)

  const handleMouseMove = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    x.set((e.clientX - centerX) * 0.2)
    y.set((e.clientY - centerY) * 0.2)
  }

  const handleMouseLeave = () => {
    x.set(0)
    y.set(0)
  }

  if (highlight) {
    return (
      <motion.div className="inline-flex" style={{ x, y }}>
        <Link
          href={href}
          className={`relative text-sm font-semibold transition-colors group inline-flex min-h-[44px] items-center rounded-full border border-cinematic-orange/30 bg-cinematic-orange/10 px-4 py-2 text-cinematic-orange hover:bg-cinematic-orange/20 ${
            active ? "bg-cinematic-orange/20" : ""
          }`}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          aria-current={active ? "page" : undefined}
        >
          {children}
        </Link>
      </motion.div>
    )
  }

  return (
    <motion.div className="inline-flex" style={{ x, y }}>
      <Link
        href={href}
        className={`group relative inline-flex min-h-[44px] items-center text-sm font-medium after:absolute after:-bottom-1 after:left-0 after:h-0.5 after:rounded-full after:content-[''] after:transition-all after:duration-300 ${
          active
            ? "text-white after:right-0 after:bg-cinematic-orange"
            : "text-muted-foreground hover:text-white after:w-0 after:bg-gradient-to-r after:from-cinematic-orange after:to-cinematic-blue hover:after:w-full"
        }`}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        aria-current={active ? "page" : undefined}
      >
        {children}
      </Link>
    </motion.div>
  )
}

export function Navbar({
  initialIsAuthenticated,
}: {
  initialIsAuthenticated?: boolean
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [routeHash, setRouteHash] = useState("")
  /** After mount, use real hash so first paint matches SSR (avoids hydration errors). */
  const [hasMounted, setHasMounted] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const { scrollY } = useScroll()

  const syncHash = useCallback(() => setRouteHash(readLocationHash()), [])

  useEffect(() => {
    syncHash()
    setHasMounted(true)
  }, [syncHash])

  useEffect(() => {
    syncHash()
  }, [pathname, syncHash])

  useEffect(() => {
    window.addEventListener("hashchange", syncHash)
    window.addEventListener("popstate", syncHash)
    return () => {
      window.removeEventListener("hashchange", syncHash)
      window.removeEventListener("popstate", syncHash)
    }
  }, [syncHash])

  useEffect(() => {
    if (!mobileMenuOpen) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [mobileMenuOpen])

  useEffect(() => {
    if (!mobileMenuOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileMenuOpen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [mobileMenuOpen])

  useMotionValueEvent(scrollY, "change", (latest) => {
    setScrolled(latest > 20)
  })

  async function handleSignOut() {
    try {
      const { signOutClientSession } = await import("@/modules/auth/application/client-sign-out")
      const err = await signOutClientSession("/")
      if (err?.error) return
    } catch {
      /* ignore */
    }
  }

  const effectiveAuthenticated = initialIsAuthenticated ?? false
  const effectiveLoading = false
  const hashForActive = hasMounted ? routeHash : ""

  const navLinks = effectiveAuthenticated ? authNavLinks : guestNavLinks

  const isActive = (href: string) => isNavLinkActive(href, pathname, hashForActive)

  const headerSurface =
    scrolled || mobileMenuOpen
      ? "bg-[#0a0a0a]/80 backdrop-blur-2xl border-b border-white/10 shadow-2xl shadow-black/30"
      : "bg-transparent"

  return (
    <>
      <motion.header
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${headerSurface}`}
      >
        {/* Film strip decoration top */}
        <div className="absolute top-0 left-0 right-0 h-px overflow-hidden">
          <motion.div 
            className="h-full w-[200%] bg-gradient-to-r from-transparent via-cinematic-orange/50 to-transparent"
            animate={{ x: ["-50%", "0%"] }}
            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">

            {/* ── Logo ─────────────────────────────────────── */}
            <Link href={effectiveAuthenticated ? "/dashboard" : "/"} className="flex items-center gap-2.5 group shrink-0">
              <motion.div
                whileHover={{ rotate: 15, scale: 1.1 }}
                transition={{ duration: 0.3, type: "spring" }}
                className="relative w-9 h-9 rounded-lg bg-gradient-to-br from-cinematic-orange to-cinematic-orange/70 flex items-center justify-center overflow-hidden"
              >
                {/* Animated film perforations */}
                <div className="absolute inset-0 flex flex-col justify-between py-0.5 px-0.5 opacity-30">
                  <div className="flex justify-between">
                    <div className="w-1 h-1 bg-black rounded-full" />
                    <div className="w-1 h-1 bg-black rounded-full" />
                  </div>
                  <div className="flex justify-between">
                    <div className="w-1 h-1 bg-black rounded-full" />
                    <div className="w-1 h-1 bg-black rounded-full" />
                  </div>
                </div>
                <Film className="w-5 h-5 text-black relative z-10" aria-hidden="true" />
                {/* Glow effect on scroll */}
                <motion.div
                  className="absolute inset-0 rounded-lg bg-cinematic-orange"
                  animate={scrolled ? { 
                    opacity: [0.3, 0.6, 0.3],
                    scale: [1, 1.3, 1]
                  } : { 
                    opacity: 0, 
                    scale: 1 
                  }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              </motion.div>
              <motion.span 
                className="text-lg font-bold bg-gradient-to-r from-white via-white to-white/80 bg-clip-text text-transparent"
                whileHover={{ x: 2 }}
              >
                Writers Block
              </motion.span>
            </Link>

            {/* ── Desktop Navigation ───────────────────────── */}
            <nav className="hidden md:flex items-center gap-6" aria-label="Primary navigation">
              {navLinks.map((link) => (
                <MagneticLink 
                  key={link.href} 
                  href={link.href} 
                  active={isActive(link.href)}
                  highlight={link.highlight}
                >
                  {link.label}
                </MagneticLink>
              ))}
            </nav>

            {/* ── Desktop CTA ──────────────────────────────── */}
            <div className="hidden md:flex items-center gap-3 shrink-0">
              {effectiveLoading ? (
                <div className="flex items-center gap-3" aria-hidden="true">
                  <div className="h-8 w-16 bg-white/10 rounded-md animate-pulse" />
                  <div className="h-8 w-32 bg-gradient-to-r from-white/10 to-white/5 rounded-md animate-pulse" />
                </div>
              ) : effectiveAuthenticated ? (
                <>
                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-white hover:bg-white/5 touch-target gap-2"
                      onClick={() => router.push("/dashboard/subscription")}
                    >
                      <CreditCard className="w-4 h-4" />
                      Plan
                    </Button>
                  </motion.div>
                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-white hover:bg-white/5 touch-target"
                      onClick={handleSignOut}
                      aria-label="Sign out of your account"
                    >
                      Sign Out
                    </Button>
                  </motion.div>
                </>
              ) : (
                <>
                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-white hover:bg-white/5 touch-target"
                      onClick={() => router.push("/signin")}
                      aria-label="Sign in to your account"
                    >
                      Sign In
                    </Button>
                  </motion.div>
                  <motion.div 
                    whileHover={{ scale: 1.05 }} 
                    whileTap={{ scale: 0.95 }}
                    className="relative"
                  >
                    {/* Button glow */}
                    <div className="absolute inset-0 bg-cinematic-orange/50 blur-xl rounded-lg opacity-0 hover:opacity-100 transition-opacity duration-300 -z-10" />
                    <Button
                      size="sm"
                      className="bg-cinematic-orange text-black font-semibold hover:bg-cinematic-orange/90 shadow-lg shadow-cinematic-orange/20 relative overflow-hidden group"
                      onClick={() => router.push("/signup")}
                    >
                      <motion.span
                        animate={{ rotate: [0, 15, -15, 0] }}
                        transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 3 }}
                      >
                        <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                      </motion.span>
                      Get Started Free
                      {/* Shine effect */}
                      <motion.div
                        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -skew-x-12"
                        animate={{ x: ["-200%", "200%"] }}
                        transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                      />
                    </Button>
                  </motion.div>
                </>
              )}
            </div>

            {/* ── Mobile Toggle ────────────────────────────── */}
            <motion.button
              whileTap={{ scale: 0.95 }}
              className="md:hidden p-2 rounded-lg text-white hover:bg-white/5 transition-colors relative touch-target min-h-[44px] min-w-[44px]"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-menu"
            >
              <AnimatePresence mode="wait">
                {mobileMenuOpen ? (
                  <motion.div
                    key="close"
                    initial={{ rotate: -90, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    exit={{ rotate: 90, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <X className="w-5 h-5" />
                  </motion.div>
                ) : (
                  <motion.div
                    key="menu"
                    initial={{ rotate: 90, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    exit={{ rotate: -90, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Menu className="w-5 h-5" />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.button>
          </div>

          {/* ── Mobile Menu ──────────────────────────────────── */}
          <AnimatePresence>
            {mobileMenuOpen ? (
              <motion.div
                id="mobile-menu"
                key="mobile-menu"
                role="dialog"
                aria-modal="true"
                aria-label="Site navigation"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                className="md:hidden max-h-[min(75dvh,32rem)] overflow-y-auto overscroll-contain border-t border-white/10 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
              >
                <nav className="flex flex-col gap-1 py-3" aria-label="Mobile navigation">
                  {navLinks.map((link, index) => {
                    const active = isActive(link.href)
                    return (
                      <motion.div
                        key={link.href}
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.04, duration: 0.2 }}
                      >
                        <Link
                          href={link.href}
                          className={`flex w-full min-h-[48px] items-center gap-3 rounded-lg px-4 py-3 text-base font-medium transition-colors ${
                            active
                              ? "border-l-2 border-cinematic-orange bg-gradient-to-r from-cinematic-orange/20 to-transparent text-white"
                              : link.highlight
                                ? "border-l-2 border-cinematic-orange bg-cinematic-orange/10 text-cinematic-orange"
                                : "text-muted-foreground hover:bg-white/5 hover:text-white"
                          }`}
                          onClick={() => {
                            setMobileMenuOpen(false)
                            requestAnimationFrame(syncHash)
                          }}
                        >
                          {link.icon ? (
                            <link.icon className="h-5 w-5 shrink-0 opacity-90" aria-hidden />
                          ) : null}
                          <span className="min-w-0 flex-1 text-left">{link.label}</span>
                        </Link>
                      </motion.div>
                    )
                  })}

                  <div className="mt-2 flex flex-col gap-2 border-t border-white/10 px-2 pt-4">
                    {effectiveLoading ? (
                      <div className="flex flex-col gap-2">
                        <div className="h-11 rounded-lg bg-white/10 animate-pulse" />
                        <div className="h-11 rounded-lg bg-white/10 animate-pulse" />
                      </div>
                    ) : effectiveAuthenticated ? (
                      <>
                        <Button
                          variant="ghost"
                          className="h-12 justify-start gap-2 text-muted-foreground hover:text-white"
                          onClick={() => {
                            setMobileMenuOpen(false)
                            router.push("/dashboard/subscription")
                          }}
                        >
                          <CreditCard className="h-4 w-4" />
                          Subscription
                        </Button>
                        <Button
                          variant="ghost"
                          className="h-12 justify-start text-muted-foreground hover:text-white"
                          onClick={() => {
                            setMobileMenuOpen(false)
                            void handleSignOut()
                          }}
                        >
                          Sign Out
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="ghost"
                          className="h-12 justify-start text-muted-foreground hover:text-white"
                          onClick={() => {
                            setMobileMenuOpen(false)
                            router.push("/signin")
                          }}
                        >
                          Sign In
                        </Button>
                        <Button
                          className="h-12 bg-cinematic-orange font-semibold text-black hover:bg-cinematic-orange/90"
                          onClick={() => {
                            setMobileMenuOpen(false)
                            router.push("/signup")
                          }}
                        >
                          <Sparkles className="mr-1.5 h-4 w-4" />
                          Get Started Free
                        </Button>
                      </>
                    )}
                  </div>
                </nav>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </motion.header>

      {/* Spacer for fixed header */}
      <div className="h-16" />
    </>
  )
}
