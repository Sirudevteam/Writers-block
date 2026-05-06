export function formatCsv(
  headers: string[],
  rows: (string | number | null | undefined)[][]
): string {
  const esc = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return ""
    const s = String(v)
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  return [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\r\n") + "\r\n"
}
