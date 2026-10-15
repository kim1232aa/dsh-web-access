// Model-facing tool specs (defineTool DSL). index.js wraps them with defineTool.
const recency = { type: 'string', enum: ['day', 'week', 'month', 'year'], description: 'Filter results by recency.' }
const domains = { type: 'array', items: { type: 'string' }, description: 'Limit to domains; prefix with - to exclude.' }
const numResults = { type: 'integer', description: 'Results per query (default 5, max 20).' }
const provider = { type: 'string', enum: ['auto', 'searxng', 'exa', 'brave', 'tavily', 'duckduckgo'], description: 'Search provider; auto = configured fallback chain (keyless Exa/DuckDuckGo work without keys).' }

function clip(s, n) { return s.length > n ? `${s.slice(0, n)}\n[… truncated; use get_search_content]` : s }

export function toolSpecs(core, config) {
  const max = core.maxInline
  const t = config.tools ?? {}
  const specs = []
  if (t.webSearch !== false) specs.push({
    name: 'web_search',
    description: 'Search the web and return bounded, source-linked results. Full results are stored; retrieve with get_search_content using the returned responseId.',
    parameters: {
      query: { type: 'string', description: 'Single search query.' },
      queries: { type: 'array', items: { type: 'string' }, description: 'Multiple queries searched concurrently.' },
      numResults, recencyFilter: recency, domainFilter: domains, provider,
      includeContent: { type: 'boolean', description: 'Also fetch full page content of results (retrievable via fetchId).' },
    },
    output: { schema: { type: 'json' }, render: (_a, v) => [{ type: 'text', text: clip(
      [`responseId: ${v.responseId}${v.fetchId ? `  fetchId: ${v.fetchId}` : ''}`,
        ...v.queries.map(q => `## ${q.query}${q.provider ? ` [${q.provider}]` : ''}\n${q.error ? `Error: ${q.error}` : q.results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`).join('\n')}`)].join('\n\n'), max) }] },
    isConcurrencySafe: () => true,
    execute: (args, exec) => core.webSearch(args, exec?.signal),
  })
  if (t.fetchContent !== false) specs.push({
    name: 'fetch_content',
    description: 'Fetch URL(s) and return content. mode=readable extracts readable markdown (default); raw returns the exact textual HTTP body. Full content is stored for get_search_content.',
    parameters: {
      url: { type: 'string', description: 'Single URL.' },
      urls: { type: 'array', items: { type: 'string' }, description: 'Multiple URLs fetched in parallel.' },
      mode: { type: 'string', enum: ['readable', 'raw'], description: 'readable (default) or raw.' },
    },
    output: { schema: { type: 'json' }, render: (_a, v) => {
      const per = Math.max(2000, Math.floor(max / Math.max(1, v.urls.length)))
      return [{ type: 'text', text: [`responseId: ${v.responseId ?? 'none'}`, ...v.urls.map(u => `# ${u.title}\n${u.url}${u.status ? ` (HTTP ${u.status})` : ''}\n${u.error ? `Error: ${u.error}\n` : ''}${clip(u.content, per)}`)].join('\n\n') }]
    } },
    isConcurrencySafe: () => true,
    execute: (args, exec) => core.fetchContent(args, exec?.signal),
  })
  if (t.getSearchContent !== false) specs.push({
    name: 'get_search_content',
    description: 'Retrieve bounded pages of stored content from web_search / fetch_content / source_check by responseId, or find passages with findText.',
    parameters: {
      responseId: { type: 'string', required: true, description: 'responseId from a previous call.' },
      query: { type: 'string' }, queryIndex: { type: 'integer' },
      url: { type: 'string' }, urlIndex: { type: 'integer' },
      offset: { type: 'integer' }, limit: { type: 'integer' },
      findText: { type: 'array', items: { type: 'string' }, description: 'Texts to find (1-10).' },
      findMode: { type: 'string', enum: ['exact', 'case-insensitive', 'fuzzy'] },
    },
    output: { schema: { type: 'json' }, render: (_a, v) => [{ type: 'text', text: `[${v.label}] ${v.totalChars} chars${v.matches != null ? `, ${v.matches} matches` : ''}\n\n${v.text}` }] },
    isConcurrencySafe: () => true,
    execute: async args => core.getSearchContent(args),
  })
  if (t.sourceCheck !== false) specs.push({
    name: 'source_check',
    description: 'Gather web sources for a claim and return a machine-readable evidence artifact (with passages when fetchContent=true) for manual review.',
    parameters: {
      claim: { type: 'string', required: true, description: 'The assertion to gather sources for.' },
      queries: { type: 'array', items: { type: 'string' } },
      numResults, recencyFilter: recency, domainFilter: domains, provider,
      fetchContent: { type: 'boolean', description: 'Fetch up to 5 pages for passage extraction.' },
    },
    output: { schema: { type: 'json' }, render: (_a, v) => [{ type: 'text', text: clip(JSON.stringify(v, null, 2), max) }] },
    isConcurrencySafe: () => true,
    execute: (args, exec) => core.sourceCheck(args, exec?.signal),
  })
  const names = config.toolNames ?? {}
  const key = { web_search: 'webSearch', fetch_content: 'fetchContent', get_search_content: 'getSearchContent', source_check: 'sourceCheck' }
  for (const sp of specs) { const n = names[key[sp.name]]; if (n) sp.name = n }
  return specs
}
