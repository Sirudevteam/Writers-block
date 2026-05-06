/**
 * Shared table-based, inline-styled HTML for Resend (and reference for Supabase auth templates).
 * Colors align with the app: cinematic dark + orange/blue (see src/modules/auth/presentation/components/auth-shell, tailwind.config).
 */

const COLORS = {
  pageBg: "#060605",
  cardBg: "#0c0c0b",
  border: "1px solid rgba(255,255,255,0.08)",
  text: "#e8e8e6",
  muted: "rgba(255,255,255,0.55)",
  fainter: "rgba(255,255,255,0.38)",
  orange: "#ff6b35",
  blue: "#00d4ff",
  footBg: "rgba(255,255,255,0.04)",
} as const

function escapePreheader(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export function getPublicSiteOrigin(): string {
  const u = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (u) {
    return u.replace(/\/$/, "")
  }
  return "https://writersblock.app"
}

type WritersBlockEmailOptions = {
  /** Invisible preheader; keeps inbox previews on-brand. */
  preheader: string
  title: string
  /** Main HTML (already safe — callers must escape user content). */
  bodyHtml: string
  primaryCta?: { href: string; label: string }
  /** Extra line(s) in the footer area above the legal line. */
  footnote?: string
}

/**
 * Full document for transactional email (Gmail, Apple Mail, basic Outlook).
 */
export function writersBlockEmailDocument({
  preheader,
  title,
  bodyHtml,
  primaryCta,
  footnote,
}: WritersBlockEmailOptions): string {
  const ctaRow = primaryCta
    ? `
  <tr>
    <td style="padding:8px 0 28px 0;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0">
        <tr>
          <td style="border-radius:12px; background:linear-gradient(135deg, ${COLORS.orange} 0%, #c94a20 100%);">
            <a href="${primaryCta.href}" style="display:inline-block; padding:14px 28px; font-size:15px; font-weight:700; color:#0a0a0a; text-decoration:none; font-family:system-ui,Segoe UI,Helvetica,Arial,sans-serif; border-radius:12px;">${primaryCta.label}</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>`
    : ""

  const foot = footnote
    ? `<p style="margin:0 0 10px 0; font-size:12px; line-height:1.5; color:${COLORS.muted};">${footnote}</p>`
    : ""

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width" />
  <title>${escapePreheader(title)}</title>
</head>
<body style="margin:0; padding:0; background:${COLORS.pageBg}; -webkit-text-size-adjust:100%;">
  <div style="display:none; max-height:0; overflow:hidden; mso-hide:all;">${escapePreheader(preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${COLORS.pageBg};">
    <tr>
      <td align="center" style="padding:32px 16px 48px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px; border:${COLORS.border}; border-radius:16px; background:${COLORS.cardBg}; overflow:hidden;">
          <tr>
            <td style="padding:28px 28px 20px 28px; text-align:center; border-bottom:${COLORS.border};">
              <p style="margin:0; font-size:20px; font-weight:700; letter-spacing:-0.02em; color:${COLORS.orange}; font-family:var(--font-space, Georgia), 'Space Grotesk', system-ui, sans-serif;">Writers Block</p>
              <p style="margin:8px 0 0 0; font-size:11px; text-transform:uppercase; letter-spacing:0.18em; color:${COLORS.muted}; font-family:ui-monospace,monospace;">Screenplay &middot; AI</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 8px 28px; color:${COLORS.text}; font-family:system-ui,Segoe UI,Helvetica,Arial,sans-serif; font-size:15px; line-height:1.6;">
              <h1 style="margin:0 0 16px 0; font-size:22px; font-weight:700; line-height:1.25; color:#ffffff;">${escapePreheader(title)}</h1>
              <div style="color:${COLORS.text};">
                ${bodyHtml}
              </div>
            </td>
          </tr>
          ${ctaRow}
          <tr>
            <td style="padding:0 28px 28px 28px;">
              ${foot}
              <p style="margin:0 0 8px 0; font-size:12px; line-height:1.5; color:${COLORS.fainter};">
                If you didn&apos;t expect this message, you can ignore it.
              </p>
              <p style="margin:0; font-size:12px; color:${COLORS.muted};">
                &mdash; The Writers Block team
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px; background:${COLORS.footBg}; border-top:${COLORS.border}; text-align:center;">
              <p style="margin:0; font-size:11px; color:${COLORS.fainter};">
                <span style="color:${COLORS.blue};">W</span>riters Block &middot; <a href="${getPublicSiteOrigin()}" style="color:${COLORS.muted}; text-decoration:underline;">${getPublicSiteOrigin().replace(/^https?:\/\//, "")}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
