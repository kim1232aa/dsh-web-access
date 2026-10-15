// Provider registry + auto fallback routing.
import { searchDuckDuckGo } from './duckduckgo.js'
import { searchExa } from './exa.js'
import { searchBrave, searchSearxng, searchTavily } from './keyed.js'

export const PROVIDERS = ['searxng', 'exa', 'brave', 'tavily', 'duckduckgo']

function env(name) { return name ? process.env[name] || '' : '' }

export function providerSettings(config) {
  return {
    searxng: { available: !!(config.searxngBaseUrl || env('SEARXNG_BASE_URL')), baseUrl: config.searxngBaseUrl || env('SEARXNG_BASE_URL') },
    exa: { available: true, apiKey: config.exaApiKey || env('EXA_API_KEY') },
    brave: { apiKey: config.braveApiKey || env('BRAVE_API_KEY') },
    tavily: { apiKey: config.tavilyApiKey || env('TAVILY_API_KEY') },
    duckduckgo: { available: true },
  }
}

const IMPL = { searxng: searchSearxng, exa: searchExa, brave: searchBrave, tavily: searchTavily, duckduckgo: searchDuckDuckGo }

export function isAvailable(name, s) {
  const x = s[name]; if (!x) return false
  return x.available ?? !!x.apiKey
}

/** Runs one query; returns { provider, answer, results } or throws aggregated error. */
export async function searchOne(query, { provider = 'auto', config, opts = {}, fetchImpl = fetch, impl = IMPL }) {
  const s = providerSettings(config)
  const chain = provider && provider !== 'auto' ? [provider]
    : (config.searchProviders?.length ? config.searchProviders : PROVIDERS)
  const errors = []
  for (const name of chain) {
    if (!isAvailable(name, s)) { errors.push(`${name}: ${s[name] ? 'not configured' : 'unknown provider'}`); continue }
    if (!impl[name]) { errors.push(`${name}: unknown provider`); continue }
    try {
      const r = await impl[name](query, { ...opts, ...s[name] }, fetchImpl)
      if (provider === 'auto' && r.results.length === 0 && chain.indexOf(name) < chain.length - 1) { errors.push(`${name}: no results`); continue }
      return { provider: name, ...r }
    } catch (e) {
      if (opts.signal?.aborted) throw e
      errors.push(`${name}: ${e.message}`)
    }
  }
  throw new Error(`All search providers failed — ${errors.join('; ') || 'none available'}`)
}
