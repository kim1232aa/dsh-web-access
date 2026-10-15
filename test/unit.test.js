import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isBlockedAddress, assertPublicUrl } from '../lib/ssrf.js'
import { ResultStore } from '../lib/storage.js'
import { findText } from '../lib/find.js'
import { parseDuckDuckGo } from '../lib/search/duckduckgo.js'
import { parseExaMcpText, parseMcpBody } from '../lib/search/exa.js'
import { searchOne } from '../lib/search/index.js'
import { createCore } from '../lib/core.js'
import { htmlToReadable } from '../lib/extract.js'

const tmp = () => mkdtempSync(join(tmpdir(), 'dwa-'))
const pub = async () => [{ address: '93.184.216.34' }]

test('ssrf blocks private/loopback/metadata, honors allowRanges', async () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.1.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:10.0.0.1']) assert.ok(isBlockedAddress(ip), ip)
  assert.ok(!isBlockedAddress('8.8.8.8'))
  assert.ok(!isBlockedAddress('198.18.0.5', ['198.18.0.0/15']))
  await assert.rejects(assertPublicUrl('http://localhost/'))
  await assert.rejects(assertPublicUrl('file:///etc/passwd'))
  await assert.rejects(assertPublicUrl('http://u:p@example.com/', { resolver: pub }))
  await assert.rejects(assertPublicUrl('http://x.test/', { resolver: async () => [{ address: '10.0.0.1' }] }))
  assert.ok(await assertPublicUrl('https://example.com/', { resolver: pub }))
})

test('storage put/get/ttl/prune', () => {
  const s = new ResultStore({ root: tmp(), maxEntries: 2 })
  const a = s.put({ kind: 'fetch', urls: [] }); s.put({}); const c = s.put({})
  assert.equal(s.get(c).id, c)
  assert.equal(s.get('../etc') ?? null, null)
  const s2 = new ResultStore({ root: tmp(), ttlMs: -1 }); assert.equal(s2.get(s2.put({})), null)
  assert.ok(a)
})

test('findText modes', () => {
  const t = 'Install with npm.\nThen configure Retry and timeout.'
  assert.equal(findText(t, 'retry').matches, 1)
  assert.equal(findText(t, 'retry', 'exact').matches, 0)
  assert.equal(findText(t, 'configure timeout', 'fuzzy').matches, 1)
})

test('duckduckgo parser + domain filter', () => {
  const html = `<div class="result"><a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fa.com%2Fx">A</a><a class="result__snippet">sa</a></div>
  <div class="result result--ad"><a class="result__a" href="https://ad.com">Ad</a></div>
  <div class="result"><a class="result__a" href="https://b.org/">B</a></div>`
  const r = parseDuckDuckGo(html, {})
  assert.deepEqual(r.results.map(x => x.url), ['https://a.com/x', 'https://b.org/'])
  assert.equal(parseDuckDuckGo(html, { domainFilter: ['-a.com'] }).results.length, 1)
  assert.throws(() => parseDuckDuckGo('<div id="challenge-form"></div>'))
})

test('exa MCP parsing', () => {
  const body = 'event: message\ndata: ' + JSON.stringify({ result: { content: [{ type: 'text', text: 'Title: T\nURL: https://e.com\nText: hello world\n---' }] } })
  const r = parseExaMcpText(parseMcpBody(body))
  assert.deepEqual(r, [{ title: 'T', url: 'https://e.com', snippet: 'hello world' }])
})

test('auto routing falls through failures', async () => {
  const impl = { searxng: async () => { throw new Error('x') }, exa: async () => { throw new Error('rate') }, duckduckgo: async () => ({ answer: '', results: [{ title: 't', url: 'u', snippet: '' }] }) }
  const r = await searchOne('q', { config: { searchProviders: ['exa', 'brave', 'duckduckgo'] }, impl })
  assert.equal(r.provider, 'duckduckgo')
  await assert.rejects(searchOne('q', { provider: 'brave', config: {}, impl }), /not configured/)
})

test('readable extraction', () => {
  const r = htmlToReadable('<html><head><title>Hi</title></head><body><p>Hello <a href="/x">link</a></p></body></html>', 'https://s.com/a')
  assert.equal(r.title, 'Hi'); assert.match(r.content, /https:\/\/s\.com\/x/)
})

test('core fetch -> store -> get_search_content paging', async () => {
  const html = `<html><title>Doc</title><body><article>${'<p>alpha beta gamma.</p>'.repeat(200)}</article></body></html>`
  const fetchImpl = async () => new Response(html, { headers: { 'content-type': 'text/html' } })
  const core = createCore({ maxInlineContentChars: 1000 }, { fetchImpl, resolver: pub, store: new ResultStore({ root: tmp() }) })
  const f = await core.fetchContent({ url: 'https://doc.example/' })
  assert.equal(f.urls[0].title, 'Doc'); assert.ok(f.responseId)
  const g = core.getSearchContent({ responseId: f.responseId, offset: 0, limit: 5000 })
  assert.match(g.text, /continue with offset=1000/)
  const blocked = await core.fetchContent({ url: 'http://127.0.0.1:3080/' })
  assert.match(blocked.urls[0].error, /Blocked/)
})

test('redirect to private host is blocked', async () => {
  const fetchImpl = async () => new Response(null, { status: 302, headers: { location: 'http://internal.test/' } })
  const resolver = async h => h === 'internal.test' ? [{ address: '10.0.0.9' }] : [{ address: '93.184.216.34' }]
  const core = createCore({}, { fetchImpl, resolver, store: new ResultStore({ root: tmp() }) })
  const f = await core.fetchContent({ url: 'https://pub.example/' })
  assert.match(f.urls[0].error, /Blocked private address/)
})
