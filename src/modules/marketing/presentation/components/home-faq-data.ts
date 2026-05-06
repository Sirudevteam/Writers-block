import { PRO_MONTHLY_INR, PREMIUM_MONTHLY_INR } from "@/modules/billing/domain/pricing-inr"

export type HomeFAQItem = {
  /** Anchor for in-page links (e.g. footer legal). */
  id?: string
  question: string
  answer: string
}

const pro = PRO_MONTHLY_INR.toLocaleString("en-IN")
const prem = PREMIUM_MONTHLY_INR.toLocaleString("en-IN")

export const faqItems: HomeFAQItem[] = [
  {
    question: "How does Writers Block help me finish a better screenplay faster?",
    answer:
      "You focus on the scene and the emotional beat. Writers Block handles industry-style formatting, Tamil and English blend, and continuation so you are not starting from a blank page every time. The goal is a draft you can iterate on, not generic filler.",
  },
  {
    question: "Does it support the Tamil screenplay format?",
    answer:
      "Yes. The editor and exports follow common screenplay structure: scene headings, dialogue, and parentheticals, with support for natural Tamil lines alongside English slugs and technical terms. You can work in Tamil first mode or mix with English as your story needs.",
  },
  {
    question: "What do I get on the Free plan vs Pro?",
    answer: `The Free plan is Learn & Explore: 100K AI credits/month, up to about 800 words per generation, 3 lifetime project creations, Fast drafting mode, and watermarked print/email PDF. Deleting a Free project does not restore a creation. Pro (from ₹${pro}/month) is Build & Create: 600K AI credits/month, Smart routing, higher-quality outputs, reusable active project slots, dialogue and continuation tools, style rewrite, clean PDF export, and paid 100K credit top-ups for ₹99.`,
  },
  {
    question: "Can I export my screenplay to PDF?",
    answer:
      "Yes. You can use browser print on every plan. Free exports include a visible preview watermark, and Free users can buy a one-time clean PDF download for ₹99. Pro and Premium give you clean PDFs ready to share, including the email PDF feature.",
  },
  {
    question: "What powers the writing behind the scenes?",
    answer:
      "Screenplay, continuation, shot ideas, and similar flows run through an internal router. The app shows simple writing power levels instead of model names: Fast on Free, Smart on Pro, and Cinematic on Premium. AI credits are used based on content length and complexity.",
  },
  {
    question: "Is Writers Block suitable for beginner screenwriters?",
    answer:
      "Yes. The Free tier is a low risk way to learn the craft while the app handles formatting. When you are ready to write something you would share with a team, Pro adds the tools and clean export that make that realistic.",
  },
  {
    question: "Is there team or API access for studios?",
    answer: `Full team workspaces and a public API are on our roadmap. Today, Premium (₹${prem}/month) is Produce & Scale: 2M AI credits/month, a Cinematic plan profile, longer long-form outputs, unlimited projects under a high cap, and 200 AI generations/day. Fair usage policy applies.`,
  },
  {
    question: "Is there a free trial for paid plans?",
    answer:
      "The Free plan is the trial: no card required, 3 lifetime project creations, full editor access, and watermarked export so you can experience the product end to end. Deleting Free projects does not restore credits. Upgrade or buy a one-time ₹99 clean PDF when the draft is ready to leave your desk.",
  },
  {
    id: "faq-cookies",
    question: "Do you use cookies?",
    answer:
      "Like most web apps, we use cookies and similar storage for sign in sessions, preferences, and security. Essential cookies keep you logged in and protect your account. You can control optional cookies in your browser settings. For full legal wording, use the contact details on Siru AI Labs if you need a written policy.",
  },
  {
    id: "faq-refunds",
    question: "What is your refund policy?",
    answer:
      "Paid plans are processed by our payment provider at the price shown at checkout. If something went wrong with billing or you believe you were charged in error, contact us through Siru AI Labs and we will review your case. We do not guarantee refunds for every situation; outcomes depend on the payment provider rules and what happened with your account.",
  },
]
