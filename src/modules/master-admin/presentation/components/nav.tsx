"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

type NavItem = { href: string; label: string }

function isActive(pathname: string, href: string) {
  const [base] = href.split("?")
  if (base === "/master-admin") return pathname === "/master-admin"
  return pathname.startsWith(base)
}

export function MasterAdminNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname()
  return (
    <nav aria-label="Master admin" className="flex flex-wrap items-center gap-2 text-sm">
      {items.map((item) => {
        const active = isActive(pathname, item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-lg border px-3 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinematic-orange/50 ${
              active
                ? "border-cinematic-orange/50 bg-cinematic-orange/10 text-cinematic-orange"
                : "border-white/10 bg-white/5 text-white/70 hover:border-white/20 hover:text-white"
            }`}
            aria-current={active ? "page" : undefined}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

