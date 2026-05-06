"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, CheckCircle2, Clock, LifeBuoy, Loader2, Send } from "lucide-react"
import { Button } from "@/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/components/card"
import { Input } from "@/ui/components/input"
import { Textarea } from "@/ui/components/textarea"
import { parseErrorResponse } from "@/core/http/client"
import { useUser } from "@/modules/account/presentation/hooks/use-user"

type SupportTicketCategory = "billing" | "ai_output" | "export_issue" | "account_recovery" | "other"
type SupportTicketStatus = "open" | "pending" | "resolved" | "closed"

type SupportTicket = {
  id: string
  email?: string | null
  category: SupportTicketCategory
  subject: string
  message?: string | null
  status: SupportTicketStatus
  created_at: string
  updated_at?: string | null
}

const SUPPORT_CATEGORIES: Array<{ value: SupportTicketCategory; label: string }> = [
  { value: "billing", label: "Billing" },
  { value: "ai_output", label: "AI output" },
  { value: "export_issue", label: "Export issue" },
  { value: "account_recovery", label: "Account recovery" },
  { value: "other", label: "Other" },
]

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value))
}

function categoryLabel(value: string): string {
  return SUPPORT_CATEGORIES.find((category) => category.value === value)?.label ?? "Other"
}

function statusClass(status: SupportTicketStatus): string {
  if (status === "resolved" || status === "closed") {
    return "border-green-500/20 bg-green-500/10 text-green-300"
  }
  if (status === "pending") {
    return "border-yellow-500/20 bg-yellow-500/10 text-yellow-200"
  }
  return "border-cinematic-blue/20 bg-cinematic-blue/10 text-cinematic-blue"
}

function statusIcon(status: SupportTicketStatus) {
  if (status === "resolved" || status === "closed") {
    return <CheckCircle2 className="h-3.5 w-3.5" />
  }
  return <Clock className="h-3.5 w-3.5" />
}

export default function SupportPage() {
  const { user, profile, loading: userLoading } = useUser()
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [loadingTickets, setLoadingTickets] = useState(true)
  const [ticketsError, setTicketsError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [email, setEmail] = useState("")
  const [category, setCategory] = useState<SupportTicketCategory>("billing")
  const [subject, setSubject] = useState("")
  const [message, setMessage] = useState("")

  const defaultEmail = useMemo(() => profile?.email || user?.email || "", [profile?.email, user?.email])

  useEffect(() => {
    setEmail((current) => current || defaultEmail)
  }, [defaultEmail])

  const loadTickets = useCallback(async () => {
    setLoadingTickets(true)
    setTicketsError(null)
    try {
      const res = await fetch("/api/support/tickets", {
        cache: "no-store",
        credentials: "same-origin",
      })
      if (!res.ok) {
        throw new Error(await parseErrorResponse(res, "Failed to load support tickets"))
      }
      const data = (await res.json()) as { tickets?: SupportTicket[] }
      setTickets(Array.isArray(data.tickets) ? data.tickets : [])
    } catch (err) {
      setTicketsError(err instanceof Error ? err.message : "Failed to load support tickets")
    } finally {
      setLoadingTickets(false)
    }
  }, [])

  useEffect(() => {
    void loadTickets()
  }, [loadTickets])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitError(null)
    setSuccessMessage(null)

    const trimmedEmail = email.trim()
    const trimmedSubject = subject.trim()
    const trimmedMessage = message.trim()
    if (!trimmedEmail || !trimmedSubject || !trimmedMessage) {
      setSubmitError("Email, subject, and message are required.")
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/support/tickets", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmedEmail,
          category,
          subject: trimmedSubject,
          message: trimmedMessage,
          metadata: {
            source: "dashboard_support",
            path: window.location.pathname,
          },
        }),
      })

      if (!res.ok) {
        throw new Error(await parseErrorResponse(res, "Failed to create support ticket"))
      }

      const data = (await res.json()) as { ticket?: SupportTicket }
      if (data.ticket) {
        setTickets((current) => [data.ticket as SupportTicket, ...current])
      } else {
        await loadTickets()
      }
      setSubject("")
      setMessage("")
      setSuccessMessage("Support ticket created.")
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to create support ticket")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="min-w-0 flex-1">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0a0a0a]/80 backdrop-blur-xl">
        <div className="pl-14 lg:pl-6 pr-6 py-4">
          <div className="flex items-center gap-4">
            <Button asChild variant="ghost" size="icon" className="text-muted-foreground hover:text-white">
              <Link href="/dashboard" aria-label="Back to dashboard">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold font-display text-white">Support</h1>
              <p className="text-sm text-muted-foreground">Create and track support tickets</p>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)]">
        <Card className="border-white/10 bg-card/50">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cinematic-orange/20 bg-cinematic-orange/10">
                <LifeBuoy className="h-5 w-5 text-cinematic-orange" />
              </div>
              <div>
                <CardTitle className="text-lg text-white">New ticket</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">Send billing, account, export, or AI output issues.</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {successMessage && (
              <div className="mb-4 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-300">
                {successMessage}
              </div>
            )}
            {submitError && (
              <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {submitError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="support-email" className="text-sm font-medium text-white">
                    Email
                  </label>
                  <Input
                    id="support-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    disabled={userLoading}
                    maxLength={320}
                    className="border-white/10 bg-background/50 text-white"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="support-category" className="text-sm font-medium text-white">
                    Category
                  </label>
                  <select
                    id="support-category"
                    value={category}
                    onChange={(event) => setCategory(event.target.value as SupportTicketCategory)}
                    className="h-10 w-full rounded-md border border-white/10 bg-background/50 px-3 text-sm text-white"
                  >
                    {SUPPORT_CATEGORIES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="support-subject" className="text-sm font-medium text-white">
                  Subject
                </label>
                <Input
                  id="support-subject"
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  maxLength={200}
                  className="border-white/10 bg-background/50 text-white"
                  required
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="support-message" className="text-sm font-medium text-white">
                  Message
                </label>
                <Textarea
                  id="support-message"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  maxLength={5000}
                  className="min-h-[180px] resize-y border-white/10 bg-background/50 text-white"
                  required
                />
                <div className="text-right text-xs text-muted-foreground">{message.length} / 5000</div>
              </div>

              <Button
                type="submit"
                disabled={submitting || !email.trim() || !subject.trim() || !message.trim()}
                className="h-11 w-full bg-cinematic-orange text-black hover:bg-cinematic-orange/90 sm:w-auto"
              >
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Submit ticket
              </Button>
            </form>
          </CardContent>
        </Card>

        <aside className="space-y-4">
          <Card className="border-white/10 bg-card/50">
            <CardHeader>
              <CardTitle className="text-lg text-white">Your tickets</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingTickets ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading tickets...
                </div>
              ) : ticketsError ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                    {ticketsError}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-white/10 text-white hover:bg-white/10"
                    onClick={() => void loadTickets()}
                  >
                    Retry
                  </Button>
                </div>
              ) : tickets.length === 0 ? (
                <p className="text-sm text-muted-foreground">No support tickets yet.</p>
              ) : (
                <div className="space-y-3">
                  {tickets.slice(0, 20).map((ticket) => (
                    <div key={ticket.id} className="rounded-xl border border-white/10 bg-black/15 p-3">
                      <div className="mb-2 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-white">{ticket.subject}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {categoryLabel(ticket.category)} - {formatDate(ticket.created_at)}
                          </p>
                        </div>
                        <span
                          className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusClass(ticket.status)}`}
                        >
                          {statusIcon(ticket.status)}
                          {ticket.status}
                        </span>
                      </div>
                      {ticket.message && (
                        <p className="line-clamp-3 text-xs leading-5 text-white/55">{ticket.message}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </main>
  )
}
