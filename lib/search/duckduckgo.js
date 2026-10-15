// Keyless DuckDuckGo HTML search (after pi duckduckgo.ts).
import { parseHTML } from 'linkedom'
import { UA } from '../http.js'
import { answerFrom, clampN, domainOk, splitDomains, timeout } from './common.js'

const SEARCH_URL = 'https://html.duckduckgo.com/html/'

function decode(href) {
  try {
    const link = new URL(href, SEARCH_URL)
    const u = new URL(link.searchParams.get('uddg') ?? link.href)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null
  } catch { return null }
}

export function parseDuckDuckGo(html, opts = {}) {
  const { document } = parseHTML(html)
  if (document.querySelector('.anomaly-modal__box, #challenge-form')) throw new Error('DuckDuckGo bot check (rate limited)')
  const f = splitDomains(opts.domainFilter)
  const n = clampN(opts.numResults)
  const results = []
  let parseable = 0
  for (const c of document.querySelectorAll('.result')) {
    if (c.classList.contains('result--ad')) continue
    const a = c.querySelector('.result__a')
    const title = a?.textContent?.trim() ?? ''
    const url = a?.getAttribute('href') ? decode(a.getAttribute('href').trim()) : null
    if (!title || !url) continue
    parseable++
    if (!domainOk(url, f)) continue
    results.push({ title, url, snippet: c.querySelector('.result__snippet')?.textContent?.trim() ?? '' })
    if (results.length >= n) break
  }
  if (!parseable && !document.querySelector('.no-results__message')) throw new Error('DuckDuckGo returned no parseable results')
  return { answer: answerFrom(results), results }
}

export async function searchDuckDuckGo(query, opts = {}, fetchImpl = fetch) {
  const url = new URL(SEARCH_URL); url.searchParams.set('q', query)
  const res = await fetchImpl(url, { headers: { accept: 'text/html', 'user-agent': UA }, signal: timeout(opts.signal) })
  const body = await res.text()
  if (res.status === 202) throw new Error('DuckDuckGo bot check (HTTP 202, rate limited)')
  if (!res.ok) throw new Error(`DuckDuckGo error ${res.status}: ${body.slice(0, 200)}`)
  return parseDuckDuckGo(body, opts)
}
