// File-backed result cache (TTL 1h, 128 entries / 128 MiB), after pi storage.ts.
import { mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, rmSync, chmodSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { tmpdir, userInfo } from 'node:os'

export function defaultCacheRoot() {
  let u = 'user'; try { u = userInfo().username } catch {}
  return join(tmpdir(), `dsh-web-access-${u}`)
}

export class ResultStore {
  constructor({ root = defaultCacheRoot(), ttlMs = 3600_000, maxEntries = 128, maxBytes = 128 * 1024 * 1024 } = {}) {
    this.dir = join(root, 'web-search-cache')
    Object.assign(this, { ttlMs, maxEntries, maxBytes })
    mkdirSync(this.dir, { recursive: true, mode: 0o700 })
    try { chmodSync(this.dir, 0o700) } catch {}
  }
  file(id) {
    if (!/^[a-z0-9-]{8,64}$/i.test(id)) throw new Error(`Invalid responseId: ${id}`)
    return join(this.dir, `${id}.json`)
  }
  put(data) {
    const id = randomUUID().replace(/-/g, '').slice(0, 16)
    writeFileSync(this.file(id), JSON.stringify({ id, createdAt: Date.now(), ...data }), { mode: 0o600 })
    this.prune(id)
    return id
  }
  get(id) {
    try {
      const rec = JSON.parse(readFileSync(this.file(id), 'utf8'))
      if (Date.now() - rec.createdAt > this.ttlMs) { rmSync(this.file(id), { force: true }); return null }
      return rec
    } catch { return null }
  }
  prune(keep) {
    const now = Date.now()
    let entries = readdirSync(this.dir).filter(f => f.endsWith('.json'))
      .filter(f => f !== `${keep}.json`).map(f => {
      const p = join(this.dir, f); const s = statSync(p); return { p, m: s.mtimeMs, size: s.size }
    })
    for (const e of entries) if (now - e.m > this.ttlMs) rmSync(e.p, { force: true })
    entries = entries.filter(e => now - e.m <= this.ttlMs).sort((a, b) => a.m - b.m)
    let bytes = entries.reduce((a, e) => a + e.size, 0)
    while (entries.length && (entries.length + (keep ? 1 : 0)) > this.maxEntries || (entries.length && bytes > this.maxBytes)) {
      const e = entries.shift(); bytes -= e.size; rmSync(e.p, { force: true })
    }
  }
}
