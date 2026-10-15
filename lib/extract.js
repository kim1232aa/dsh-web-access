// HTML -> readable markdown (Readability + Turndown over linkedom).
import { parseHTML } from 'linkedom'
import { Readability } from '@mozilla/readability'
import TurndownService from 'turndown'

const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' })
td.remove(['script', 'style', 'noscript', 'iframe'])

export function htmlToReadable(html, url) {
  const { document } = parseHTML(html)
  const title = (document.querySelector('title')?.textContent || '').trim()
  let articleHtml = null, articleTitle = title
  try {
    const art = new Readability(document.cloneNode(true)).parse()
    if (art?.content && art.textContent?.trim().length > 200) { articleHtml = art.content; articleTitle = art.title || title }
  } catch { /* fall through */ }
  if (!articleHtml) articleHtml = document.querySelector('body')?.innerHTML || html
  let md = td.turndown(articleHtml).replace(/\n{3,}/g, '\n\n').trim()
  if (url) md = md.replace(/\]\((\/[^)]*)\)/g, (_m, p) => { try { return `](${new URL(p, url)})` } catch { return `](${p})` } })
  return { title: articleTitle, content: md }
}

export function isHtml(ct, body) {
  return /html|xml/i.test(ct) || /^\s*<(!doctype|html)/i.test(body.slice(0, 200))
}
