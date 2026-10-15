// Exa: keyless via public MCP endpoint, or direct API with exaApiKey (after pi exa.ts).
import { answerFrom, clampN, domainOk, splitDomains, timeout } from './common.js'

const MCP_URL = 'https://mcp.exa.ai/mcp'
const API = 'https://api.exa.ai/search'

export function parseExaMcpText(text) {
  try { const j = JSON.parse(text); if (Array.isArray(j.results)) return j.results.map(r => ({ title: r.title || r.url, url: r.url, snippet: String(r.text || '').replace(/\s+/g, ' ').slice(0, 500) })) } catch {}
  return text.split(/(?=^Title: )/m).map(b => {
    const title = b.match(/^Title: (.+)/m)?.[1]?.trim() ?? ''
    const url = b.match(/^URL: (.+)/m)?.[1]?.trim() ?? ''
    const i = b.indexOf('\nText: ')
    const h = b.match(/\nHighlights:\s*\n/)
    let content = i >= 0 ? b.slice(i + 7) : h?.index != null ? b.slice(h.index + h[0].length) : ''
    content = content.replace(/\n---\s*$/, '').replace(/\s+/g, ' ').trim().slice(0, 500)
    return { title: title || url, url, snippet: content }
  }).filter(r => r.url)
}

export function parseMcpBody(body) {
  let parsed = null
  for (const line of body.split('\n')) {
    if (!line.startsWith('data:')) continue
    try { const c = JSON.parse(line.slice(5).trim()); if (c?.result || c?.error) { parsed = c; break } } catch {}
  }
  if (!parsed) { try { parsed = JSON.parse(body) } catch {} }
  if (!parsed) throw new Error('Exa MCP returned an empty response')
  if (parsed.error) throw new Error(`Exa MCP error: ${parsed.error.message || 'unknown'}`)
  const text = parsed.result?.content?.find(c => c.type === 'text' && c.text?.trim())?.text
  if (parsed.result?.isError || !text) throw new Error(text || 'Exa MCP returned empty content')
  return text
}

export async function searchExa(query, opts = {}, fetchImpl = fetch) {
  const n = clampN(opts.numResults)
  const f = splitDomains(opts.domainFilter)
  let results
  if (opts.apiKey) {
    const res = await fetchImpl(API, {
      method: 'POST', signal: timeout(opts.signal),
      headers: { 'content-type': 'application/json', 'x-api-key': opts.apiKey },
      body: JSON.stringify({ query, numResults: n, contents: { text: { maxCharacters: 1000 } },
        ...(f.allowed.length ? { includeDomains: f.allowed } : {}), ...(f.blocked.length ? { excludeDomains: f.blocked } : {}) }),
    })
    if (!res.ok) throw new Error(`Exa API error ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const j = await res.json()
    results = (j.results || []).map(r => ({ title: r.title || r.url, url: r.url, snippet: String(r.text || '').replace(/\s+/g, ' ').slice(0, 500) }))
  } else {
    const q = [query, ...(opts.domainFilter || []).map(d => d.startsWith('-') ? `-site:${d.slice(1)}` : `site:${d}`)].join(' ')
    const res = await fetchImpl(`${MCP_URL}?tools=web_search_exa`, {
      method: 'POST', signal: timeout(opts.signal),
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'x-exa-source': 'dsh-web-access' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'web_search_exa', arguments: { query: q, numResults: n } } }),
    })
    const body = await res.text()
    if (!res.ok) throw new Error(`Exa MCP error ${res.status}: ${body.slice(0, 200)}`)
    results = parseExaMcpText(parseMcpBody(body))
  }
  results = results.filter(r => domainOk(r.url, f)).slice(0, n)
  return { answer: answerFrom(results), results }
}
