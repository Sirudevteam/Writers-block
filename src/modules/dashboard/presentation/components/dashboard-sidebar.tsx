"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import {
  LayoutDashboard,
  FolderOpen,
  CreditCard,
  Settings,
  LifeBuoy,
  Building2,
  FileText,
  Menu,
  X,
  Film,
  LogOut,
  Sparkles,
  Shield,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { Button } from "@/ui/components/button"
import { signOutClientSession } from "@/modules/auth/application/client-sign-out"
import { useMotionPreference } from "@/shared/hooks/use-motion-preference"
import { cn } from "@/shared/utils/cn"

const SIDEBAR_COLLAPSED_KEY = "writersblock-sidebar-collapsed"

interface NavItem {
  href: string
  label: string
  icon: React.ElementType
}

const consumerNavItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/projects", label: "My Projects", icon: FolderOpen },
  { href: "/dashboard/documents", label: "Documents", icon: FileText },
  { href: "/dashboard/subscription", label: "Subscription", icon: CreditCard },
  { href: "/dashboard/org", label: "Organization", icon: Building2 },
  { href: "/dashboard/support", label: "Support", icon: LifeBuoy },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
]

const operatorConsumerExtra: NavItem = {
  href: "/dashboard/admin",
  label: "Platform admin",
  icon: Shield,
}

const adminShellNavItems: NavItem[] = [
  { href: "/dashboard/admin", label: "Overview", icon: LayoutDashboard },
]

function isAdminShellPath(pathname: string | null): boolean {
  if (!pathname) return false
  return pathname === "/dashboard/admin" || pathname.startsWith("/dashboard/admin/")
}

function isNavItemActive(pathname: string, href: string): boolean {
  if (pathname === href) return true
  if (href === "/dashboard") return false
  return pathname.startsWith(`${href}/`)
}

export function DashboardSidebar({ isOperator }: { isOperator: boolean }) {
  const pathname = usePathname()
  const { shouldReduceMotion } = useMotionPreference()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarPrefHydrated, setSidebarPrefHydrated] = useState(false)

  const adminShell = Boolean(isOperator && isAdminShellPath(pathname))

  useEffect(() => {
    try {
      const v = localStorage.getItem(SIDEBAR_COLLAPSED_KEY)
      if (v === "1") setSidebarCollapsed(true)
    } catch {
      /* ignore */
    }
    setSidebarPrefHydrated(true)
  }, [])

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((c) => {
      const next = !c
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0")
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  const handleSignOut = async () => {
    setSigningOut(true)
    try {
      const err = await signOutClientSession("/signin")
      if (err?.error) setSigningOut(false)
    } catch {
      setSigningOut(false)
    }
  }

  useEffect(() => {
    if (!mobileMenuOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [mobileMenuOpen])

  useEffect(() => {
    if (!mobileMenuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileMenuOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [mobileMenuOpen])

  const consumerItems = isOperator
    ? [...consumerNavItems, operatorConsumerExtra]
    : consumerNavItems

  const navItems = adminShell ? adminShellNavItems : consumerItems

  const logoHref = adminShell ? "/dashboard/admin" : "/"
  const subtitle = adminShell ? "Platform admin" : "Dashboard"
  const ariaLabel = adminShell ? "Platform admin" : "Dashboard"

  const transitionClass = shouldReduceMotion ? "" : "transition-[width] duration-300 ease-out"

  const desktopCollapsed = sidebarPrefHydrated && sidebarCollapsed

  return (
    <div
      className={cn(
        "relative z-40 w-0 shrink-0 self-stretch lg:w-64",
        desktopCollapsed && "lg:w-[4.5rem]",
        transitionClass
      )}
    >
      <button
        type="button"
        className="fixed left-4 top-[max(1rem,env(safe-area-inset-top))] z-50 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-white/10 bg-[#0f0f0f]/90 p-2.5 backdrop-blur-xl lg:hidden"
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        aria-expanded={mobileMenuOpen}
        aria-controls="dashboard-sidebar-nav"
        aria-label="Toggle sidebar"
      >
        <AnimatePresence mode="wait">
          {mobileMenuOpen ? (
            <motion.div
              key="close"
              initial={shouldReduceMotion ? false : { rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={shouldReduceMotion ? undefined : { rotate: 90, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <X className="w-5 h-5 text-white" />
            </motion.div>
          ) : (
            <motion.div
              key="menu"
              initial={shouldReduceMotion ? false : { rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={shouldReduceMotion ? undefined : { rotate: -90, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Menu className="w-5 h-5 text-white" />
            </motion.div>
          )}
        </AnimatePresence>
      </button>

      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}
      </AnimatePresence>

      <motion.aside
        id="dashboard-sidebar-nav"
        role="navigation"
        aria-label={ariaLabel}
        initial={{ x: -280 }}
        animate={{ x: 0 }}
        className={cn(
          `fixed inset-y-0 left-0 z-40 flex min-h-0 w-full max-w-[min(100vw,20rem)] flex-col border-r backdrop-blur-2xl
          transform duration-300 ease-out
          lg:relative lg:inset-auto lg:z-0 lg:min-h-screen lg:w-full lg:max-w-none lg:translate-x-0 lg:transform-none`,
          shouldReduceMotion ? "" : "transition-transform",
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          adminShell
            ? "border-cinematic-orange/25 bg-[#070707]/95 from-cinematic-orange/10"
            : "border-white/10 bg-[#0a0a0a]/95"
        )}
      >
        <div
          className={cn(
            "absolute inset-0 bg-gradient-to-b pointer-events-none",
            adminShell
              ? "from-cinematic-orange/15 via-transparent to-cinematic-blue/5"
              : "from-cinematic-orange/5 via-transparent to-cinematic-blue/5"
          )}
        />

        <div
          className={cn(
            "relative flex items-start gap-2 border-b border-white/10 pt-[max(1.5rem,env(safe-area-inset-top))]",
            desktopCollapsed ? "lg:flex-col lg:items-center lg:px-2 lg:pb-3 lg:pt-4" : "p-4 sm:p-6 sm:pt-6"
          )}
        >
          <Link
            href={logoHref}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-3 group",
              desktopCollapsed && "lg:flex-initial lg:justify-center"
            )}
          >
            <motion.div
              whileHover={shouldReduceMotion ? undefined : { rotate: 15, scale: 1.1 }}
              transition={{ duration: 0.2 }}
              className={cn(
                "h-10 w-10 shrink-0 rounded-xl flex items-center justify-center relative overflow-hidden",
                adminShell
                  ? "bg-gradient-to-br from-cinematic-orange to-amber-600"
                  : "bg-gradient-to-br from-cinematic-orange to-cinematic-orange/70"
              )}
            >
              {adminShell ? (
                <Shield className="w-5 h-5 text-black relative z-10" />
              ) : (
                <Film className="w-5 h-5 text-black relative z-10" />
              )}
              <div className="absolute inset-0 bg-cinematic-orange/50 blur-lg" />
            </motion.div>
            <div className={cn("min-w-0", desktopCollapsed && "lg:hidden")}>
              <span className="font-bold text-white text-lg">Writers Block</span>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                {adminShell ? (
                  <Shield className="w-3 h-3 text-cinematic-orange" />
                ) : (
                  <Sparkles className="w-3 h-3 text-cinematic-orange" />
                )}
                {subtitle}
              </p>
            </div>
          </Link>

          <button
            type="button"
            onClick={toggleSidebarCollapsed}
            className={cn(
              "hidden lg:flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinematic-orange/50",
              desktopCollapsed && "lg:mt-1"
            )}
            aria-expanded={!desktopCollapsed}
            aria-controls="dashboard-sidebar-nav"
            title={desktopCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {desktopCollapsed ? (
              <ChevronRight className="h-4 w-4" aria-hidden />
            ) : (
              <ChevronLeft className="h-4 w-4" aria-hidden />
            )}
          </button>
        </div>

        <nav
          className={cn(
            "relative flex-1 space-y-1 overflow-y-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))]",
            desktopCollapsed && "lg:px-2 lg:pt-2"
          )}
        >
          {navItems.map((item, index) => {
            const isActive = isNavItemActive(pathname, item.href)
            const Icon = item.icon

            return (
              <motion.div
                key={item.href}
                initial={shouldReduceMotion ? false : { opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: shouldReduceMotion ? 0 : index * 0.05 }}
              >
                <Link
                  href={item.href}
                  title={item.label}
                  aria-label={item.label}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    `relative flex items-center gap-3 rounded-xl transition-all duration-200 group
                    ${isActive
                      ? "bg-cinematic-orange/10 text-cinematic-orange border border-cinematic-orange/20"
                      : "text-muted-foreground hover:bg-white/5 hover:text-white"
                    }`,
                    desktopCollapsed ? "lg:justify-center lg:px-2 lg:py-3" : "px-4 py-3"
                  )}
                >
                  {isActive && (
                    <div
                      className={cn(
                        "absolute left-0 h-8 w-1 rounded-r-full bg-cinematic-orange",
                        desktopCollapsed && "lg:left-0.5"
                      )}
                      aria-hidden
                    />
                  )}
                  <Icon
                    className={cn(
                      "h-5 w-5 shrink-0 transition-colors",
                      isActive ? "text-cinematic-orange" : "group-hover:text-white"
                    )}
                  />
                  <span
                    className={cn(
                      "font-medium",
                      desktopCollapsed && "lg:sr-only"
                    )}
                  >
                    {item.label}
                  </span>
                  {isActive && (
                    <motion.div
                      layoutId="activeGlow"
                      className="absolute inset-0 bg-cinematic-orange/5 rounded-xl -z-10"
                    />
                  )}
                </Link>
              </motion.div>
            )
          })}

          {adminShell && (
            <motion.div
              initial={shouldReduceMotion ? false : { opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: shouldReduceMotion ? 0 : navItems.length * 0.05 }}
              className={cn(
                "mt-2 border-t border-white/10 pt-4",
                desktopCollapsed && "lg:px-0"
              )}
            >
              <Link
                href="/dashboard"
                title="Member app"
                aria-label="Member app — open personal dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  "relative flex items-center gap-3 rounded-xl border border-transparent transition-all duration-200 text-muted-foreground hover:bg-white/5 hover:text-white hover:border-white/10",
                  desktopCollapsed ? "lg:justify-center lg:px-2 lg:py-3" : "px-4 py-3"
                )}
              >
                <ArrowLeft className="h-5 w-5 shrink-0" />
                <span className={cn("font-medium", desktopCollapsed && "lg:sr-only")}>
                  Member app
                </span>
              </Link>
              <p
                className={cn(
                  "px-4 pt-1 text-[11px] leading-snug text-muted-foreground/80",
                  desktopCollapsed && "lg:hidden"
                )}
              >
                Your personal dashboard, projects, and subscription.
              </p>
            </motion.div>
          )}
        </nav>

        <div
          className={cn(
            "relative border-t border-white/10 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]",
            desktopCollapsed && "lg:px-2"
          )}
        >
          <Button
            variant="ghost"
            title="Sign out"
            className={cn(
              "w-full justify-start text-muted-foreground hover:text-white hover:bg-white/5 rounded-xl",
              desktopCollapsed && "lg:justify-center lg:px-2"
            )}
            onClick={handleSignOut}
            disabled={signingOut}
          >
            <LogOut className="h-5 w-5 shrink-0 lg:mr-0 mr-3" />
            <span className={cn(desktopCollapsed && "lg:sr-only")}>
              {signingOut ? "Signing out..." : "Sign Out"}
            </span>
          </Button>
        </div>
      </motion.aside>
    </div>
  )
}
