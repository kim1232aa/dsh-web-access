// Bounded passage finder (exact / case-insensitive / fuzzy), after pi content-find.ts.
const CONTEXT = 300, MAX_OUT = 20000

function norm(s) { return s.toLowerCase().replace(/\s+/g, ' ') }

export function findText(content, needles, mode = 'case-insensitive') {
  const list = Array.isArray(needles) ? needles : [needles]
  const out = []
  let total = 0, budget = MAX_OUT
  for (const n of list) {
    const hits = []
    if (mode === 'fuzzy') {
      const words = norm(n).split(' ').filter(Boolean)
      const lines = content.split('\n')
      let off = 0
      for (const line of lines) {
        const l = norm(line)
        const score = words.filter(w => l.includes(w)).length
        if (words.length && score / words.length >= 0.6) hits.push(off)
        off += line.length + 1
      }
    } else {
      const hay = mode === 'exact' ? content : content.toLowerCase()
      const nd = mode === 'exact' ? n : n.toLowerCase()
      let i = hay.indexOf(nd)
      while (i !== -1 && hits.length < 50) { hits.push(i); i = hay.indexOf(nd, i + nd.length) }
    }
    total += hits.length
    out.push(`## "${n}" — ${hits.length} match(es)`)
    for (const h of hits.slice(0, 10)) {
      const s = Math.max(0, h - CONTEXT), e = Math.min(content.length, h + n.length + CONTEXT)
      const snip = `…[${s}]…\n${content.slice(s, e)}\n…`
      if (snip.length > budget) { out.push('(output budget reached)'); break }
      budget -= snip.length
      out.push(snip)
    }
  }
  return { matches: total, text: out.join('\n\n') }
}
