/**
 * dsh-web-access — DeepSeek Harness plugin porting pi-web-access tools:
 * web_search, fetch_content, get_search_content, source_check.
 */
import Schema from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { createCore } from './lib/core.js'
import { toolSpecs } from './lib/tools.js'

export const name = 'dsh-web-access'
export const inject = ['tools']

export const Config = Schema.object({
  searchProviders: Schema.array(Schema.union(['searxng', 'exa', 'brave', 'tavily', 'duckduckgo'])).default([])
    .description('Auto fallback order (empty = searxng, exa, brave, tavily, duckduckgo; unconfigured ones are skipped).'),
  exaApiKey: Schema.string().role('secret').description('Exa API key (or EXA_API_KEY). Without it the keyless Exa MCP is used.'),
  braveApiKey: Schema.string().role('secret').description('Brave Search key (or BRAVE_API_KEY).'),
  tavilyApiKey: Schema.string().role('secret').description('Tavily key (or TAVILY_API_KEY).'),
  searxngBaseUrl: Schema.string().description('Self-hosted SearXNG base URL (or SEARXNG_BASE_URL).'),
  cacheRoot: Schema.string().description('Cache directory root (default: OS temp dir/dsh-web-access-<user>).'),
  maxInlineContentChars: Schema.natural().min(1000).default(30000).description('Max characters returned inline per call.'),
  fetchTimeoutSeconds: Schema.number().min(1).default(30).description('HTTP fetch timeout.'),
  ssrfAllowRanges: Schema.array(String).default([]).description('IPv4 CIDRs exempted from the SSRF guard (e.g. LAN SearXNG).'),
  tools: Schema.object({
    webSearch: Schema.boolean().default(true),
    fetchContent: Schema.boolean().default(true),
    getSearchContent: Schema.boolean().default(true),
    sourceCheck: Schema.boolean().default(true),
  }).default({}),
  toolNames: Schema.object({
    webSearch: Schema.string(), fetchContent: Schema.string(),
    getSearchContent: Schema.string(), sourceCheck: Schema.string(),
  }).default({}).description('Rename tools (e.g. to avoid clashing with another plugin).'),
}).i18n({
  'zh-CN': {
    $description: '网页搜索、抓取与取证工具（移植自 pi-web-access）。',
    searchProviders: 'auto 模式回退顺序（留空用默认；未配置的会跳过）。',
    cacheRoot: '缓存根目录（默认系统临时目录）。',
    ssrfAllowRanges: '豁免 SSRF 拦截的 IPv4 网段（如局域网 SearXNG）。',
  },
})

export function apply(ctx, config) {
  const core = createCore(config ?? {})
  for (const spec of toolSpecs(core, config ?? {})) ctx.tools.register(defineTool(spec))
}
