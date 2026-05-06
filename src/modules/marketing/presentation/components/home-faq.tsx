"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Plus, Minus } from "lucide-react"
import { faqItems, type HomeFAQItem } from "@/modules/marketing/presentation/components/home-faq-data"

function FAQItem({ item, index }: { item: HomeFAQItem; index: number }) {
  const [open, setOpen] = useState(false)

  return (
    <motion.div
      id={item.id}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.05 }}
      className="border border-white/10 rounded-xl overflow-hidden scroll-mt-24"
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left hover:bg-white/[0.03] transition-colors"
        aria-expanded={open}
      >
        <span className="font-semibold text-white text-[15px] leading-snug">
          {item.question}
        </span>
        <span
          className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
            open
              ? "bg-cinematic-orange text-black"
              : "bg-white/10 text-white"
          }`}
          aria-hidden="true"
        >
          {open ? <Minus className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="answer"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
          >
            <p className="px-6 pb-5 text-[15px] leading-relaxed text-muted-foreground">
              {item.answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export function HomeFAQSection() {
  return (
    <section
      id="faq"
      aria-label="Frequently asked questions"
      className="scroll-mt-16 py-24 px-4 sm:px-6 lg:px-8"
    >
      <div className="mx-auto max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-14 text-center"
        >
          <span className="mb-3 inline-block text-xs font-semibold uppercase tracking-widest text-cinematic-blue">
            FAQ
          </span>
          <h2 className="mb-4 text-3xl font-bold font-display text-white sm:text-4xl">
            Frequently Asked{" "}
            <span className="text-cinematic-blue">Questions</span>
          </h2>
          <p className="text-lg text-muted-foreground">
            Everything you need to know about AI screenplay writing with Writers Block.
          </p>
        </motion.div>

        <div className="space-y-3">
          {faqItems.map((item, index) => (
            <FAQItem key={item.id ?? item.question} item={item} index={index} />
          ))}
        </div>
      </div>
    </section>
  )
}
