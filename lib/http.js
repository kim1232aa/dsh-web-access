// Guarded fetch: SSRF check on every hop, manual redirects, timeout, size cap.
import { assertPublicUrl } from './ssrf.js'

export const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'

export async function safeFetch(url, opts = {}) {
  const { allowRanges = [], timeoutMs = 30000, maxBytes = 5 * 1024 * 1024, maxRedirects = 5,
    method = 'GET', headers = {}, body, signal, fetchImpl = fetch, resolver } = opts
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(new Error(`timed out after ${timeoutMs} ms`)), timeoutMs)
  const onAbort = () => ctl.abort(signal.reason)
  signal?.addEventListener?.('abort', onAbort, { once: true })
  try {
    let current = url
    let m = method, b = body
    for (let hop = 0; hop <= maxRedirects; hop++) {
      await assertPublicUrl(current, { allowRanges, ...(resolver ? { resolver } : {}) })
      const res = await fetchImpl(current, {
        method: m, body: b, redirect: 'manual', signal: ctl.signal,
        headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8', ...headers },
      })
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        current = new URL(res.headers.get('location'), current).toString()
        if (res.status === 303 || ((res.status === 301 || res.status === 302) && m === 'POST')) { m = 'GET'; b = undefined }
        continue
      }
      const reader = res.body?.getReader()
      const chunks = []
      let size = 0, truncated = false
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          size += value.byteLength
          if (size > maxBytes) { truncated = true; await reader.cancel().catch(() => {}); break }
          chunks.push(value)
        }
      }
      const buf = Buffer.concat(chunks.map(c => Buffer.from(c)))
      return { url: current, status: res.status, ok: res.ok, headers: res.headers,
        contentType: res.headers.get('content-type') || '', buffer: buf, text: () => buf.toString('utf8'), truncated }
    }
    throw new Error(`Too many redirects (>${maxRedirects})`)
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener?.('abort', onAbort)
  }
}
