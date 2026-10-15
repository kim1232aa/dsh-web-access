# dsh-web-access

DeepSeek Harness 插件：把 [pi-web-access](https://github.com/nicobailon/pi-web-access) 的网页工具移植到 dsh。

## 工具
- `web_search`：多 provider 搜索，auto 回退（searxng → exa → brave → tavily → duckduckgo）。**无需 key**：Exa（公共 MCP）、DuckDuckGo。
- `fetch_content`：URL → 可读 markdown（`readable`）或原始文本（`raw`）。
- `get_search_content`：按 `responseId` 分页 / `findText` 检索缓存（1 小时，128 条 / 128 MiB）。
- `source_check`：为一个论断搜证，可抓取前 5 页抽取段落。

所有抓取都经过 SSRF 防护（每次跳转都校验，拦截私网/回环/元数据地址）。

## 安装
```bash
dsh plugin --profile <profile> add dsh-web-access
```
bundle 会关掉 dsh 自带 `tool-web` 的 `web_search`（保留 `web_fetch`）。想保留自带的，用 `toolNames.webSearch` 改名。

## 配置（节选）
| 字段 | 说明 |
|---|---|
| `searchProviders` | auto 回退顺序 |
| `exaApiKey` / `braveApiKey` / `tavilyApiKey` | 或环境变量 `EXA_API_KEY` 等 |
| `searxngBaseUrl` | 自建 SearXNG |
| `cacheRoot` | 缓存目录 |
| `ssrfAllowRanges` | 豁免网段（fake-IP 代理如 `198.18.0.0/15`、局域网服务） |
| `tools.*` / `toolNames.*` | 开关 / 改名 |

## 尚未移植
PDF、GitHub clone/PR、YouTube/视频、answer 模式、Curator UI、浏览器 cookie、其余 30+ provider。见 `FEATURE_MAP.md`。

MIT。原作 © Nico Bailon。
