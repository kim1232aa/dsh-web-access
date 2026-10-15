// Common API-key providers: brave, tavily, searxng (self-hosted, keyless).
import { answerFrom, clampN, domainOk, splitDomains, timeout } from './common.js'

const FRESH = { day: 'pd', week: 'pw', month: 'pm', year: 'py' }

export async function searchBrave(query, opts, fetchImpl = fetch) {
  const u = new URL('https://api.search.brave.com/res/v1/web/search')
  u.searchParams.set('q', query); u.searchParams.set('count', String(clampN(opts.numResults)))
  if (FRESH[opts.recencyFilter]) u.searchParams.set('freshness', FRESH[opts.recencyFilter])
  const res = await fetchImpl(u, { headers: { accept: 'application/json', 'x-subscription-token': opts.apiKey }, signal: timeout(opts.signal) })
  if (!res.ok) throw new Error(`Brave error ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const f = splitDomains(opts.domainFilter)
  const results = ((await res.json()).web?.results || []).map(r => ({ title: r.title, url: r.url, snippet: (r.description || '').replace(/<[^>]+>/g, '') })).filter(r => domainOk(r.url, f))
  return { answer: answerFrom(results), results }
}

export async function searchTavily(query, opts, fetchImpl = fetch) {
  const f = splitDomains(opts.domainFilter)
  const res = await fetchImpl('https://api.tavily.com/search', {
    method: 'POST', signal: timeout(opts.signal),
    headers: { 'content-type': 'application/json', authorization: `Bearer ${opts.apiKey}` },
    body: JSON.stringify({ query, max_results: clampN(opts.numResults), include_answer: true,
      ...(opts.recencyFilter ? { time_range: opts.recencyFilter } : {}),
      ...(f.allowed.length ? { include_domains: f.allowed } : {}), ...(f.blocked.length ? { exclude_domains: f.blocked } : {}) }),
  })
  if (!res.ok) throw new Error(`Tavily error ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const j = await res.json()
  const results = (j.results || []).map(r => ({ title: r.title, url: r.url, snippet: r.content || '' }))
  return { answer: j.answer || answerFrom(results), results }
}

export async function searchSearxng(query, opts, fetchImpl = fetch) {
  const u = new URL('search', opts.baseUrl.endsWith('/') ? opts.baseUrl : `${opts.baseUrl}/`)
  u.searchParams.set('q', query); u.searchParams.set('format', 'json')
  if (opts.recencyFilter) u.searchParams.set('time_range', opts.recencyFilter)
  const res = await fetchImpl(u, { headers: { accept: 'application/json' }, signal: timeout(opts.signal) })
  if (!res.ok) throw new Error(`SearXNG error ${res.status}`)
  const f = splitDomains(opts.domainFilter)
  const results = ((await res.json()).results || []).map(r => ({ title: r.title, url: r.url, snippet: r.content || '' })).filter(r => domainOk(r.url, f)).slice(0, clampN(opts.numResults))
  return { answer: answerFrom(results), results }
}
