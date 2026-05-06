/**
 * WAF Attack Pattern Definitions
 *
 * Organized by OWASP Top 10 category. Each pattern is a regex designed
 * to match common exploit payloads in URL paths, query parameters, and
 * header values. Body content (user-authored screenplays) is NOT inspected
 * at the middleware level to avoid false positives on creative writing.
 *
 * All patterns are case-insensitive and operate on URL-decoded input.
 */

// ── SQLi Patterns (OWASP A03:2021 — Injection) ─────────────────────────────

export const SQLI_PATTERNS: readonly RegExp[] = [
  // Classic tautologies / boolean injection
  /(?:^|\s|[;(])or\s+[\d'"].*?=.*?[\d'"]/i,
  /(?:^|\s|[;(])and\s+[\d'"].*?=.*?[\d'"]/i,

  // UNION-based injection
  /union\s+(all\s+)?select\s/i,

  // Stacked queries — DDL/DML after semicolons
  /;\s*(?:drop|delete|insert|update|alter|create|exec|execute|truncate|replace|merge)\s/i,

  // Comment-based payload terminators
  /(?:--|#|\/\*!)\s*$/,
  /\/\*[\s\S]*?\*\//,

  // Time-based blind injection
  /sleep\s*\(\s*\d/i,
  /benchmark\s*\(\s*\d/i,
  /waitfor\s+delay\s/i,
  /pg_sleep\s*\(/i,

  // Data exfiltration functions
  /(?:load_file|into\s+(?:out|dump)file|information_schema|mysql\.user)/i,
  /(?:concat|concat_ws|group_concat)\s*\(/i,
  /char\s*\(\s*\d/i,

  // Hex-encoded payloads (common evasion)
  /0x[0-9a-f]{8,}/i,

  // System-level commands via SQL
  /(?:xp_cmdshell|sp_executesql|openrowset|opendatasource)\s*[\s(]/i,

  // PostgreSQL-specific
  /(?:pg_read_file|pg_ls_dir|current_setting)\s*\(/i,
] as const

// ── XSS Patterns (OWASP A03:2021 — Injection) ──────────────────────────────

export const XSS_PATTERNS: readonly RegExp[] = [
  // Script tags (various encodings)
  /<\s*script[\s>\/]/i,
  /<\s*\/\s*script\s*>/i,

  // Event handlers in HTML attributes
  /\bon(?:error|load|click|mouse(?:over|out|down|up|move|enter|leave)|focus|blur|change|submit|key(?:up|down|press)|dblclick|drag(?:start|end|over)?|drop|input|invalid|reset|scroll|select|touch(?:start|end|move)|unload|beforeunload|hashchange|popstate)\s*=/i,

  // JavaScript protocol handlers
  /javascript\s*:/i,
  /vbscript\s*:/i,
  /livescript\s*:/i,

  // Dangerous DOM APIs
  /document\s*\.\s*(?:cookie|domain|write(?:ln)?|location|URL|referrer)/i,
  /window\s*\.\s*(?:location|open|eval|execScript)/i,

  // Code execution functions
  /(?:^|[^a-zA-Z])eval\s*\(/i,
  /(?:^|[^a-zA-Z])(?:set(?:Timeout|Interval)|Function)\s*\(\s*['"`]/i,

  // Inline expressions (IE legacy, but still dangerous)
  /expression\s*\(/i,

  // Dangerous HTML elements
  /<\s*(?:iframe|embed|object|applet|form|base|link|meta|svg|math)\b/i,

  // SVG with event handlers
  /<svg[^>]*\bon\w+\s*=/i,

  // Data URI with HTML content
  /data\s*:\s*text\/html/i,

  // Template injection
  /\{\{.*?\}\}/,
  /\$\{.*?\}/,

  // CSS-based attacks
  /url\s*\(\s*['"]?\s*javascript/i,
  /@import\s/i,
] as const

// ── Path Traversal Patterns (OWASP A01:2021 — Broken Access Control) ────────

export const PATH_TRAVERSAL_PATTERNS: readonly RegExp[] = [
  // Classic directory traversal
  /\.\.[/\\]/,
  /[/\\]\.\./,

  // URL-encoded traversal (double-decode evasion)
  /%2e%2e[%/\\]/i,
  /%252e%252e/i,
  /\.%2e/i,
  /%2e\./i,

  // Null byte injection (truncate file extension)
  /%00/,
  /\x00/,

  // Sensitive file paths (Unix)
  /\/etc\/(?:passwd|shadow|hosts|group)/i,
  /\/proc\/(?:self|version|cmdline)/i,
  /\/var\/log\//i,

  // Sensitive file paths (Windows)
  /[a-z]:\\(?:windows|winnt|system32|boot\.ini)/i,
] as const

// ── Malicious Bot User-Agent Patterns ───────────────────────────────────────

export const MALICIOUS_BOT_PATTERNS: readonly RegExp[] = [
  // Security scanners / attack tools
  /sqlmap/i,
  /nikto/i,
  /nmap/i,
  /masscan/i,
  /dirbuster/i,
  /gobuster/i,
  /wfuzz/i,
  /ffuf/i,
  /feroxbuster/i,
  /nuclei/i,

  // Exploit frameworks
  /burpsuite|burp\s*suite/i,
  /acunetix/i,
  /nessus/i,
  /qualys/i,
  /skipfish/i,
  /w3af/i,
  /arachni/i,
  /jbrofuzz/i,
  /commix/i,
  /metasploit/i,

  // Scraper bots (aggressive ones)
  /harvest/i,
  /email.*?collector/i,
  /extract/i,

  // Headless browsers used for attacks (not legitimate crawlers)
  /phantom(?:js)?(?:\/|\s|$)/i,

  // Known bad bot signatures
  /zgrab/i,
  /censys/i,
  /shodan/i,
] as const

// ── Request Shape Limits ────────────────────────────────────────────────────

/** Maximum URL length (including query string) before blocking. */
export const MAX_URL_LENGTH = 8192

/** Maximum number of query parameters allowed. */
export const MAX_QUERY_PARAMS = 50

/** Maximum length of a single header value. */
export const MAX_HEADER_VALUE_LENGTH = 8192

// ── Pattern Categories (for logging) ────────────────────────────────────────

export type AttackCategory = "sqli" | "xss" | "path_traversal" | "malicious_bot" | "request_shape"

export interface PatternMatch {
  category: AttackCategory
  /** Which pattern triggered (index within category array). */
  patternIndex: number
  /** Snippet of the matched input (truncated for logs). */
  matchedSnippet: string
}

// ── Payload Decoder ─────────────────────────────────────────────────────────

/**
 * Decode a string through multiple encoding layers (URL-decode, unicode-decode).
 * Attackers often double/triple-encode payloads to evade WAFs, so we decode
 * recursively up to 3 levels.
 */
export function decodePayload(input: string, maxDepth = 3): string {
  let decoded = input
  for (let i = 0; i < maxDepth; i++) {
    try {
      const next = decodeURIComponent(decoded)
      if (next === decoded) break
      decoded = next
    } catch {
      break
    }
  }
  // Also decode common HTML entities
  decoded = decoded
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    )
    .replace(/&#(\d+);?/g, (_, dec) =>
      String.fromCharCode(parseInt(dec, 10))
    )
  return decoded
}
