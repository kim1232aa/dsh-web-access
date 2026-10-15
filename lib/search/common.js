export function splitDomains(domainFilter = []) {
  const allowed = [], blocked = []
  for (const raw of domainFilter) {
    const d = String(raw).trim().replace(/^-/, '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase()
    if (!d) continue
    ;(String(raw).trim().startsWith('-') ? blocked : allowed).push(d)
  }
  return { allowed, blocked }
}
export function domainOk(url, f) {
  if (!f.allowed.length && !f.blocked.length) return true
  let h; try { h = new URL(url).hostname.toLowerCase() } catch { return false }
  const m = d => h === d || h.endsWith(`.${d}`)
  if (f.allowed.length && !f.allowed.some(m)) return false
  return !f.blocked.some(m)
}
export function clampN(n) { const v = Math.trunc(Number(n) || 5); return Math.min(20, Math.max(1, v)) }
export function answerFrom(results) {
  return results.map(r => r.snippet ? `${r.snippet}\nSource: ${r.title} (${r.url})` : `Source: ${r.title} (${r.url})`).join('\n\n')
}
export function timeout(signal, ms = 30000) {
  return signal ? AbortSignal.any([AbortSignal.timeout(ms), signal]) : AbortSignal.timeout(ms)
}
