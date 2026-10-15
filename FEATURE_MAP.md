# dsh-web-access 功能对照（调研）

> 源：[`nicobailon/pi-web-access`](https://github.com/nicobailon/pi-web-access) v0.40.0 → DeepSeek Harness (dsh) 插件  
> 调研日：2026-10-15（Asia/Tokyo）  
> 本阶段：只读对照；`/workspace/dsh-web-access` 此前不存在，仅创建本文件。  
> **硬约束：禁止占用/改动端口 3080**（web profile；测试用 `mstest` 等独立 profile）。

---

## 1. 源仓库概览

| 项 | 内容 |
|---|---|
| 路径 | `/workspace/pi-web-access`（已 shallow clone） |
| 形态 | Pi coding-agent **extension**（`package.json` → `pi.extensions: ["./index.ts"]`）+ 可选 **MCP**（`pi-web-access-mcp`） |
| 入口 | `index.ts`（~2690 行，Pi UI/命令/快捷键） |
| 可复用核心 | `web-tool-core.ts`（~1543 行，**刻意 host-neutral**；Pi 与 MCP 共用） |
| 配置 | `~/.pi/agent/web-search.json`（多 API key、routing、SSRF、fetch modes…） |
| Node | `>=22.19.0` |
| 运行时依赖 | readability/defuddle/linkedom/turndown/unpdf/undici/p-limit/MCP SDK |
| Peer（Pi） | `@earendil-works/pi-{ai,coding-agent,tui}`、`typebox` — **dsh 不可依赖** |

### 1.1 面向模型的工具（4 个）

| Tool | 作用 |
|---|---|
| `web_search` | 多 provider 搜索；batch queries；fallback/`all`；可选 `includeContent`；workflow：`none` / `summary-review` / `auto-summary` |
| `fetch_content` | URL/本地路径 → readable markdown / raw / answer；特化 GitHub clone、PR/Issue、YouTube、本地视频、PDF、图片 |
| `get_search_content` | 按 `responseId` 分页/检索缓存内容（`offset`/`limit`/`findText`） |
| `source_check` | 对 claim 搜证，产出带精确引用的研究 artifact |

MCP 暴露同名 4 工具，但**去掉** Pi 专有参数（workflow/curator、prompt、answerModel、timestamp、frames、auth 等）。

### 1.2 搜索 Provider（38 个 Resolved）

`openai, brave, parallel, parallel-mcp, tinyfish, search1api, searchinfinity, querit, tavily, you, firecrawl, jina, searxng, degoog, duckduckgo, perplexity, gemini, kimi, exa, serpdive, kagi, ollama, anysearch, xai, mistral, brightdata, serpbase, serpapi, serper, serply, valyu, bocha, xcrawl, baizhi, zai, keenable, ceramic`

- **零配置默认**：Exa MCP（可无 key）；`auto` 链优先 SearXNG →（Codex 订阅时）OpenAI → Exa → Brave → …
- 大量 provider 为 **explicit-only**（须显式 `provider:`）

### 1.3 内容能力（挂在 `fetch_content` 上）

| 能力 | 要点 | 外部依赖/难点 |
|---|---|---|
| 普通网页 | readability + 多级 fallback（Jina/Firecrawl/Crawl4AI/…） | SSRF、domain policy、proxy(via curl) |
| GitHub repo | `git clone` 缓存；>350MB 走 API；`forceClone` | `git`、可选 `gh` |
| GitHub PR/Issue | `gh` + REST fallback → 结构化 markdown | `gh` CLI |
| YouTube | Gemini Web(cookies) → Gemini API → Perplexity | cookies / Gemini key / yt-dlp+ffmpeg（帧） |
| 本地视频 | Gemini Files API / Web；ffmpeg 缩略图 | ffmpeg、体积上限 ~50MB |
| PDF | endpoint → Datalab → Gemini → unpdf | 各引擎 key/自建 endpoint |
| Auth fetch | Chrome cookie profiles（`authFetch`） | **opt-in** `allowBrowserCookies`；密钥环 |
| Curator UI | 临时 HTTP + SSE + 浏览器打开 | **headless/SSH 难自动开浏览器**；端口冲突风险 |

### 1.4 Pi 专有（非 MCP）

- 命令：`/websearch` `/curator` `/search` `/google-account`
- 快捷键：curate / activity monitor
- Curator 浏览器 UI（`curator-server.ts` + `curator-page.ts` 巨大）
- 复用 Pi 登录态（Codex ChatGPT、Kimi Code Plan、当前模型 hosted search）
- TUI `renderResult` / activity widget

---

## 2. dsh 插件规范（本机参考）

### 2.1 参考插件

| 参考 | 路径 | 形态 | 要点 |
|---|---|---|---|
| **dsh-model-sync** | `/workspace/dsh-model-sync` | 单包 JS 插件 | `export name/inject/Config` + `apply(ctx)`；`package.json` 含 `dsh.bundle.patch`、`dsh.engines`；`cordis.patch.yml` 里 `insert` 一行；装进 profile：`dsh plugin --profile <name> add …` |
| **dsh-trading** | `/workspace/dsh-trading` | pnpm monorepo + bundle | 各子包 `inject: ['tools', …]`，`ctx.tools.register(defineTool({…}))`；bundle 的 `cordis.patch.yml` 批量 insert；preset 用 `@deepseek-ai/dsh-agent-preset` + persona |

测试 profile 样例：**`mstest`**（`~/.dsh/profiles/mstest`）— 注释写明 *do not touch web/3080*；bundles 含 `dsh-base` + `dsh-web-app` + 插件。

### 2.2 规范要点

1. **Cordis 插件面**：`name` / `inject` / `Config`（`@deepseek-ai/schemastery`）/ `apply(ctx, config)`；**不要 default export**（见 trading CONTRACTS 引用的 postmortem）。
2. **模型工具**：`import { defineTool } from '@deepseek-ai/dsh-tools'` → `ctx.tools.register(...)`；参数用 DSL；`output.schema` + `render`；可选 `presentCall`。
3. **Skill**：dsh 有独立 `@deepseek-ai/dsh-skill` 注册表（`ctx.skills.register` / filesystem provider）。适合「怎么用这些 web 工具」的说明书，或替代 Pi 的 `/command` 用户侧入口；**不是**工具本体。
4. **装配**：`package.json` → `dsh.profile.bundles` 或插件自带 `dsh.bundle.patch`；用户层 `cordis.patch.yml` 可再 `insert`/`config`。
5. **安装**：`dsh plugin --profile <profile> add <pkg|file:|github:>`（底层 pnpm）。
6. **CLI**：`dsh --profile <name>`；dump：`--dump-config`。

### 2.3 与 Pi extension 的映射关系

| Pi | dsh |
|---|---|
| `pi.registerTool` | `ctx.tools.register(defineTool(...))` |
| `pi.registerCommand` | skill（`userInvocable`）或 client UI；或省略 |
| `~/.pi/agent/web-search.json` | 插件 `Config` + 可选独立 JSON/env（credentials 走 dsh credentials / env） |
| Peer `pi-*` | `@deepseek-ai/cordis` + `dsh-tools` + schemastery |
| MCP server | dsh 原生 tools 已够；MCP 可二期或跳过 |
| Curator 本地 HTTP | 慎用固定端口；默认关；测试勿碰 3080 |
| Session JSONL 旁路缓存 | 自管 cache 目录（类比 `PI_WEB_ACCESS_CACHE_ROOT`） |

---

## 3. 功能对照表

### 3.1 核心 Tools

| # | pi-web-access | dsh 对应 | 优先级 | 缺口 / 移植难点 |
|---|---|---|---|---|
| T1 | `web_search` | tool `web_search` | P0 | 参数 schema 从 TypeBox → `defineTool` DSL；去掉 curator workflow 或降级为 `none`/`auto-summary`（summary 需接 dsh LLM，非 Pi model registry） |
| T2 | `fetch_content` | tool `fetch_content` | P0 | 先做 `readable`+`raw`；`answer` 需注入 dsh 模型调用；特化能力分期 |
| T3 | `get_search_content` | tool `get_search_content` | P0 | 可几乎原样移植 `storage.ts` + `content-find.ts`；路径改到 `$DSH_HOME` 或 config |
| T4 | `source_check` | tool `source_check` | P1 | 依赖 T1/T2；逻辑在 `source-check.ts` |

### 3.2 搜索与路由

| # | 能力 | dsh 对应 | 优先级 | 缺口 / 难点 |
|---|---|---|---|---|
| S1 | Provider 模块（38） | 内部 modules + Config keys | P0 子集 / P2 全量 | **先做**：exa（零 key MCP 或 API）、duckduckgo/searxng（keyless/自建）、tavily/brave/jina（常用 key）；其余按 key 开关懒加载 |
| S2 | `auto` fallback 链 | config `searchRouting` | P0 | 去掉「当前 Pi Codex/Kimi 登录」分支；改为 dsh credentials / env |
| S3 | `provider: "all"` | 同 | P2 | 并发与配额 |
| S4 | OpenAI Responses / alpha search / provider baseUrl 复用 | config | P2 | dsh 的 llm provider 模型与 Pi `models.json` 不同，需重写绑定 |
| S5 | Brave rate-limit 队列 | 内部 | P1 | 可原样搬 |

### 3.3 Fetch 特化

| # | 能力 | dsh 对应 | 优先级 | 缺口 / 难点 |
|---|---|---|---|---|
| F1 | 网页提取 + fallback 链 | 内部 `extract` | P0 | 保留 SSRF（`ssrf-protection.ts`）；undici/curl proxy |
| F2 | GitHub clone/API | fetch 分支 | P1 | 需要 `git`；沙箱策略：clone 目录白名单 |
| F3 | GitHub PR/Issue | fetch 分支 | P1 | 依赖 `gh`；无 gh 时 REST |
| F4 | PDF（unpdf → …） | fetch 分支 | P1 | 先 unpdf；远端引擎可选 |
| F5 | YouTube / 本地视频 / 帧 | fetch 分支 | P2 | Gemini key、ffmpeg、yt-dlp；**浏览器 cookie 路径在无桌面环境脆弱** |
| F6 | `auth` / Chrome cookies | config `authFetch` | P3 / 默认关 | 与 dsh sandbox、密钥环冲突风险高；明确 opt-in |
| F7 | `mode: answer` | fetch + LLM | P1 | 用 `ctx` 上的 LLM/agent 服务（需查可用 inject）；勿绑死 Pi |
| F8 | 图片 URL | fetch | P2 | 与 dsh attachment 管道对齐 |

### 3.4 UI / 命令 / 运维

| # | pi 能力 | dsh 对应 | 优先级 | 缺口 / 难点 |
|---|---|---|---|---|
| U1 | Curator 浏览器 UI | **默认不做**；或独立 client 插件 + 动态端口 | P3 | 大体积 HTML；端口绝不能写死 3080；headless 无浏览器 |
| U2 | `/websearch` 等命令 | skill 文档 + 可选 user command | P2 | dsh skill markdown |
| U3 | Activity monitor / shortcuts | 可省略或简单 log | P3 | Pi TUI 特有 |
| U4 | MCP server | 可选 `bin` 或跳过 | P3 | dsh 已有 tools 协议 |
| U5 | `toolActivation` | dsh `ctx.tools.restrict` / preset | P2 | 用 agent preset 限制工具集 |

### 3.5 配置项映射（摘要）

| pi `web-search.json` | dsh `Config`（建议） |
|---|---|
| `*ApiKey` / env | `Schema` 字段 + `apiKeyEnv` / credentials |
| `searchProvider` / `searchRouting` | `searchProvider`, `searchRouting.providers/fallbackOn` |
| `webSearch.allowedProviders` | `allowedProviders[]` |
| `tools.*.enabled` / `toolNames` | `tools` 开关（或拆成多个插件行） |
| `fetch.defaultMode/allowedModes` | `fetch.*` |
| `ssrf.allowRanges` | `ssrf.*`（自建 SearXNG/PDF endpoint 必需） |
| `proxy` | `proxy` |
| `pdf.*` / `datalabApiKey` | `pdf.*` |
| `authFetch` / `allowBrowserCookies` | 默认 `false`；文档警告 |
| `workflow` / curator* | v1 固定 `none`；summary 二期 |
| `PI_WEB_ACCESS_CACHE_ROOT` | `cacheRoot` config |

---

## 4. `/workspace/dsh-web-access` 现状

- **调研前不存在**；现仅有本 `FEATURE_MAP.md`。
- 无实现代码、无 git、未装入任何 profile。

---

## 5. 推荐目录结构

对齐 **dsh-model-sync（单包）+ trading 的 tool 注册风格**（先单包，避免过早 monorepo）：

```
dsh-web-access/
  FEATURE_MAP.md          # 本文件
  package.json            # name: dsh-web-access; dsh.bundle.patch; peer: cordis, dsh-tools, schemastery
  cordis.patch.yml        # insert id: dsh-web-access
  icon.svg                # 可选
  index.js | src/index.ts # name/inject['tools']/Config/apply → 注册 4 tools
  lib/   or src/
    web-tool-core.ts      # 从上游移植/适配（去 Pi 类型）
    storage.ts
    extract.ts
    ssrf-protection.ts
    providers/            # 按文件拆分，与上游同名便于 diff
      exa.ts, duckduckgo.ts, searxng.ts, brave.ts, tavily.ts, jina.ts, ...
    github-extract.ts     # P1
    pdf-extract.ts        # P1
    youtube-extract.ts    # P2
  skills/                 # 可选：web-research/SKILL.md
  test/
  README.md / README.zh-CN.md
```

`package.json` 关键字段（参考 model-sync）：

```json
{
  "name": "dsh-web-access",
  "type": "module",
  "main": "index.js",
  "dsh": {
    "engines": { "dsh": ">=0.2.0-rc.1" },
    "bundle": { "patch": "./cordis.patch.yml" }
  },
  "peerDependencies": {
    "@deepseek-ai/cordis": "^4.0.4",
    "@deepseek-ai/dsh-tools": "0.2.0-rc.2",
    "@deepseek-ai/schemastery": "^3.18.0"
  }
}
```

装测试 profile（**不要用占用 3080 的 web 主实例乱改**）：

```bash
# 新建或使用已有隔离 profile，例如 watest / mstest
dsh plugin --profile watest add file:/workspace/dsh-web-access
# 或在 cordis.patch.yml insert 后用非 3080 端口启动（若 web-app 可配 port）
```

---

## 6. 实现顺序（小步可测）

| 步 | 内容 | 验收 |
|---|---|---|
| 0 | 脚手架：`package.json` + `cordis.patch.yml` + 空 `apply` 注册 hello tool | `dsh plugin --profile watest add`；`--dump-config` 见行 |
| 1 | 移植 `ssrf-protection` + 最小 `fetch_content`（readable，直连 HTTP + readability） | 单测 + headless 调 tool |
| 2 | `storage` + `get_search_content` | 与 fetch 联调 responseId |
| 3 | `web_search`：duckduckgo 或 exa 一条路径 | 无 key 可测 |
| 4 | `web_search` auto 链 + 2–3 个常用 keyed provider（brave/tavily/jina） | Config + env |
| 5 | `source_check` | 依赖 3–4 |
| 6 | GitHub / PDF(unpdf) | 可选依赖检测 |
| 7 | answer mode（接 dsh LLM） | 明确 inject 服务名 |
| 8 | 其余 providers 批量搬（保持 upstream 文件边界） | 按需 |
| 9 | skill 文档；可选 curator（动态端口，**≠3080**） | 文档说明默认关 |
| 10 | YouTube/视频/cookies — 最后，且默认关 | 环境探测 |

每步：单元测试（node:test / vitest）→ 装入 **非 3080** 测试 profile → 一条真实 tool 调用。

---

## 7. Blockers / 风险

1. **Pi 登录态能力不可直接搬**：Codex 订阅搜索、Kimi `/login`、`useCurrentModel` 依赖 Pi auth；dsh 需改走 credentials/env，功能会缩水。  
2. **Curator / Gemini Web cookies**：无头环境、密钥环、端口；建议 v1 砍掉或强 opt-in。  
3. **体积与许可证**：上游 ~3万行 TS + 大量 provider；应用 `web-tool-core` 为边界，index/curator-page 不整文件搬。  
4. **Sandbox**：dsh 有 sandbox/policy；clone、curl proxy、读写 cache 需对齐策略，避免被 pre-execute 拦死。  
5. **端口 3080**：用户硬禁；任何 HTTP（curator）必须动态端口或明确非 3080；测试用独立 profile。  
6. **Peer 版本**：锁定与本机 dsh 一致的 `dsh-tools`/`cordis`（trading 用 `0.2.0-rc.2`）。  
7. **TypeBox → schemastery/defineTool DSL**：工具 schema 需重写，不能直接用 MCP TypeBox 定义。

---

## 8. 建议的 v1 范围（「完整移植」的可交付切片）

**v1 必达（完整工具面）**：T1–T4 + F1 + S1 子集（≥1 个零配置 + ≥2 个常用 API）+ SSRF + 缓存。  
**v1 明确延期**：Curator UI、Chrome cookies、全 38 provider、YouTube/视频帧、MCP bin、Pi 命令/快捷键。  
**完整移植** = 上述延期项在后续迭代按 §6 步 8–10 补齐，并保持与 upstream 行为对照表更新本文件。
