"use client"

import { motion, useMotionValue, useTransform } from "framer-motion"
import { Sparkles, Film, MessageSquare, LayoutGrid, BookOpen, ArrowRight } from "lucide-react"
import { useRef } from "react"
import Link from "next/link"

const features = [
  {
    icon: Sparkles,
    title: "AI Scene Generator",
    description:
      "Describe your scene in plain words and get a professionally formatted screenplay in seconds. Our AI understands Tamil cinema storytelling conventions.",
    size: "large",
    gradient: "from-cinematic-orange/30 via-cinematic-orange/10 to-transparent",
    iconBg: "bg-cinematic-orange/20",
    iconColor: "text-cinematic-orange",
    spotlightRgb: "255, 107, 53",
    href: "/editor",
    action: "Try it now",
  },
  {
    icon: Film,
    title: "Movie References",
    description:
      "Browse curated reference scenes from iconic Tamil and international films that match your scene's genre and mood.",
    size: "small",
    gradient: "from-cinematic-blue/30 via-cinematic-blue/10 to-transparent",
    iconBg: "bg-cinematic-blue/20",
    iconColor: "text-cinematic-blue",
    spotlightRgb: "0, 212, 255",
    href: "/editor",
    action: "Explore references",
  },
  {
    icon: MessageSquare,
    title: "Dialogue Improver",
    description:
      "Paste any dialogue and get AI rewrites that sharpen subtext and strengthen character voice.",
    size: "small",
    gradient: "from-purple-500/30 via-purple-500/10 to-transparent",
    iconBg: "bg-purple-500/20",
    iconColor: "text-purple-400",
    spotlightRgb: "168, 85, 247",
    href: "/editor",
    action: "Improve dialogue",
  },
  {
    icon: LayoutGrid,
    title: "Shot Suggestions",
    description:
      "Get AI shot composition ideas for wide, medium, close, and POV framing to visualize each scene before filming.",
    size: "medium",
    gradient: "from-green-500/30 via-green-500/10 to-transparent",
    iconBg: "bg-green-500/20",
    iconColor: "text-green-400",
    spotlightRgb: "74, 222, 128",
    href: "/editor",
    action: "Get shots",
  },
  {
    icon: BookOpen,
    title: "PDF Export",
    description:
      "Export your finished screenplay to industry standard PDF format, ready for production.",
    size: "medium",
    gradient: "from-pink-500/30 via-pink-500/10 to-transparent",
    iconBg: "bg-pink-500/20",
    iconColor: "text-pink-400",
    spotlightRgb: "244, 114, 182",
    href: "/editor",
    action: "Start writing",
  },
]

function BentoCard({ feature, index }: { feature: typeof features[0]; index: number }) {
  const cardRef = useRef<HTMLAnchorElement>(null)
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    mouseX.set(e.clientX - rect.left)
    mouseY.set(e.clientY - rect.top)
  }

  const rgb = feature.spotlightRgb ?? "255, 107, 53"
  const background = useTransform(
    [mouseX, mouseY],
    ([x, y]) =>
      `radial-gradient(400px circle at ${x}px ${y}px, rgba(${rgb},0.18), transparent 60%)`
  )

  const Icon = feature.icon

  const sizeClasses = {
    large: "md:col-span-2 md:row-span-2",
    small: "md:col-span-1",
    medium: "md:col-span-1 md:row-span-1",
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      className={`relative group ${sizeClasses[feature.size as keyof typeof sizeClasses]}`}
    >
      <Link
        ref={cardRef}
        href={feature.href}
        onMouseMove={handleMouseMove}
        className="block h-full"
      >
        <motion.div
          className={`relative h-full overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br ${feature.gradient} p-6 md:p-8 transition-all duration-300 hover:border-white/20`}
          whileHover={{ y: -4 }}
        >
          {/* Spotlight effect */}
          <motion.div
            className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            style={{ background }}
          />

          {/* Glow effect */}
          <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

          <div className="relative z-10 h-full flex flex-col">
            {/* Icon */}
            <motion.div
              className={`w-12 h-12 rounded-xl ${feature.iconBg} border border-white/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}
            >
              <Icon className={`w-6 h-6 ${feature.iconColor}`} />
            </motion.div>

            {/* Content */}
            <h3 className="text-xl md:text-2xl font-bold text-white mb-3 group-hover:text-cinematic-orange transition-colors">
              {feature.title}
            </h3>
            <p className="text-muted-foreground leading-relaxed flex-grow">
              {feature.description}
            </p>

            {/* Action indicator */}
            <div className="mt-4 flex translate-y-0 items-center gap-2 text-sm text-cinematic-orange opacity-100 transition-all duration-300 md:translate-y-2 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100">
              <span>{feature.action}</span>
              <motion.span
                className="max-md:hidden md:inline-flex"
                animate={{ x: [0, 4, 0] }}
                transition={{ duration: 1, repeat: Infinity }}
              >
                <ArrowRight className="w-4 h-4" aria-hidden />
              </motion.span>
              <ArrowRight className="h-4 w-4 md:hidden" aria-hidden />
            </div>
          </div>
        </motion.div>
      </Link>
    </motion.div>
  )
}

export function HomeFeaturesSection() {
  return (
    <section id="features" aria-label="Features" className="py-24 px-4 sm:px-6 lg:px-8 scroll-mt-16">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="inline-block text-xs font-semibold tracking-widest uppercase text-cinematic-orange mb-3 px-4 py-1.5 rounded-full bg-cinematic-orange/10 border border-cinematic-orange/20"
          >
            Features
          </motion.span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold font-display text-white mb-4">
            Every Tool a Screenwriter{" "}
            <span className="bg-gradient-to-r from-cinematic-orange to-cinematic-blue bg-clip-text text-transparent">
              Needs
            </span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
            From first idea to final draft, Writers Block is the AI writing partner built
            for Tamil and English filmmakers who want to write faster and write better.
          </p>
        </motion.div>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
          {features.map((feature, index) => (
            <BentoCard key={feature.title} feature={feature} index={index} />
          ))}
        </div>
      </div>
    </section>
  )
}
