// Host-neutral execution core (after pi web-tool-core.ts, trimmed for v1).
import { safeFetch } from './http.js'
import { htmlToReadable, isHtml } from './extract.js'
import { ResultStore } from './storage.js'
import { findText } from './find.js'
import { searchOne } from './search/index.js'

const pLimit = n => { let a = 0; const q = []; const next = () => { if (a < n && q.length) { a++; const [f, r, j] = q.shift(); f().then(r, j).finally(() => { a--; next() }) } }; return f => new Promise((r, j) => { q.push([f, r, j]); next() }) }

export function createCore(config, deps = {}) {
  const store = deps.store ?? new ResultStore({ root: config.cacheRoot || undefined })
  const fetchImpl = deps.fetchImpl ?? fetch
  const resolver = deps.resolver
  const maxInline = config.maxInlineContentChars ?? 30000
  const http = (url, o = {}) => safeFetch(url, { allowRanges: config.ssrfAllowRanges ?? [], timeoutMs: (config.fetchTimeoutSeconds ?? 30) * 1000, fetchImpl, ...(resolver ? { resolver } : {}), ...o })

  async function fetchOne(url, mode, signal) {
    const t0 = Date.now()
    try {
      const res = await http(url, { signal })
      const body = res.text()
      const base = { url, status: res.status, mimeType: res.contentType.split(';')[0] || undefined, duration: Date.now() - t0 }
      if (mode === 'raw') return { ...base, title: url, content: body, error: res.truncated ? 'truncated at 5MB' : null }
      if (!res.ok) return { ...base, title: url, content: '', error: `HTTP ${res.status}` }
      if (/^image\//.test(res.contentType)) return { ...base, title: url, content: `[image ${res.contentType}, ${res.buffer.length} bytes]`, error: null }
      if (/pdf/i.test(res.contentType)) return { ...base, title: url, content: '', error: 'PDF extraction not supported yet in dsh-web-access v1' }
      if (isHtml(res.contentType, body)) { const r = htmlToReadable(body, res.url); return { ...base, title: r.title || url, content: r.content, error: null } }
      return { ...base, title: url, content: body, error: null }
    } catch (e) {
      return { url, title: url, content: '', error: e.message, duration: Date.now() - t0 }
    }
  }

  async function fetchContent({ url, urls, mode = 'readable' }, signal) {
    const list = [...(url ? [url] : []), ...(urls ?? [])]
    if (!list.length) throw new Error('fetch_content requires url or urls')
    if (!['readable', 'raw'].includes(mode)) throw new Error(`Unsupported mode: ${mode}`)
    const limit = pLimit(3)
    const items = await Promise.all(list.map(u => limit(() => fetchOne(u, mode, signal))))
    const responseId = items.some(i => i.content) ? store.put({ kind: 'fetch', urls: items }) : null
    return { responseId, urls: items }
  }

  async function webSearch(p, signal) {
    const queries = [...(p.query ? [p.query] : []), ...(p.queries ?? [])]
    if (!queries.length) throw new Error('web_search requires query or queries')
    const limit = pLimit(3)
    const out = await Promise.all(queries.map(q => limit(async () => {
      try {
        const r = await searchOne(q, { provider: p.provider, config, fetchImpl, opts: { numResults: p.numResults, recencyFilter: p.recencyFilter, domainFilter: p.domainFilter, signal } })
        return { query: q, answer: r.answer, error: null, provider: r.provider, results: r.results }
      } catch (e) { return { query: q, answer: '', error: e.message, results: [] } }
    })))
    let fetchId = null
    if (p.includeContent) {
      const urls = [...new Set(out.flatMap(q => q.results.map(r => r.url)))].slice(0, 10)
      if (urls.length) fetchId = (await fetchContent({ urls }, signal)).responseId
    }
    const responseId = store.put({ kind: 'search', queries: out, fetchId })
    return { responseId, fetchId, queries: out }
  }

  function getSearchContent(p) {
    const rec = store.get(p.responseId)
    if (!rec) throw new Error(`No stored content for responseId ${p.responseId} (expired or unknown)`)
    let content, label
    if (rec.kind === 'search') {
      const qi = p.query != null ? rec.queries.findIndex(q => q.query === p.query) : (p.queryIndex ?? 0)
      const q = rec.queries[qi]
      if (!q) throw new Error('Query not found in stored search')
      label = `query: ${q.query}`
      content = [q.answer, '', ...q.results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`)].join('\n')
    } else {
      const items = rec.urls ?? rec.sources ?? []
      const it = p.url != null ? items.find(i => i.url === p.url) : items[p.urlIndex ?? 0]
      if (!it) throw new Error('URL not found in stored content')
      label = it.url; content = it.content ?? ''
    }
    if (p.findText) {
      const r = findText(content, p.findText, p.findMode)
      return { label, totalChars: content.length, matches: r.matches, text: r.text }
    }
    const offset = p.offset ?? 0
    const lim = Math.min(p.limit ?? maxInline, maxInline)
    const text = content.slice(offset, offset + lim)
    const more = offset + lim < content.length ? `\n\n[… ${content.length - offset - lim} more chars; continue with offset=${offset + lim}]` : ''
    return { label, totalChars: content.length, matches: null, text: text + more }
  }

  async function sourceCheck(p, signal) {
    const s = await webSearch({ queries: p.queries?.length ? p.queries : [p.claim], numResults: p.numResults, recencyFilter: p.recencyFilter, domainFilter: p.domainFilter, provider: p.provider }, signal)
    const seen = new Map()
    for (const q of s.queries) for (const r of q.results) if (!seen.has(r.url) && seen.size < 20) seen.set(r.url, { ...r, provider: q.provider })
    const sources = [...seen.values()]
    const terms = p.claim.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? []
    if (p.fetchContent) {
      const f = await fetchContent({ urls: sources.slice(0, 5).map(x => x.url) }, signal)
      for (const it of f.urls) {
        const src = seen.get(it.url); if (!src) continue
        src.content = it.content; src.fetchError = it.error
        const sentences = (it.content || '').split(/(?<=[.!?。！？])\s+/)
        src.passages = sentences.map(t => ({ t, score: terms.filter(w => t.toLowerCase().includes(w)).length }))
          .filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 3).map(x => x.t.trim().slice(0, 400))
      }
    }
    const errors = s.queries.filter(q => q.error).map(q => `${q.query}: ${q.error}`)
    const artifact = { claim: p.claim, queries: s.queries.map(q => q.query), sources: sources.map(({ content, ...x }) => x), errors, note: 'Evidence only; semantic verdict left to the reviewer.' }
    const responseId = store.put({ kind: 'source_check', artifact, sources: sources.map(x => ({ url: x.url, title: x.title, content: x.content ?? x.snippet })) })
    return { responseId, ...artifact }
  }

  return { webSearch, fetchContent, getSearchContent, sourceCheck, store, maxInline }
}
