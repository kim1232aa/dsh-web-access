// SSRF guard (adapted from pi-web-access ssrf-protection.ts): block private,
// loopback, link-local, CGNAT, multicast and metadata targets unless allowlisted.
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

function v4ToInt(ip) {
  return ip.split('.').reduce((a, o) => (a << 8) + Number(o), 0) >>> 0
}

const BLOCKED_V4 = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
]

export function inCidrV4(ip, cidr) {
  const [base, bitsStr] = cidr.split('/')
  const bits = Number(bitsStr ?? 32)
  if (isIP(base) !== 4 || !(bits >= 0 && bits <= 32)) return false
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0
  return (v4ToInt(ip) & mask) === (v4ToInt(base) & mask)
}

export function isBlockedAddress(ip, allowRanges = []) {
  let addr = ip
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(addr)
  if (mapped) addr = mapped[1]
  const fam = isIP(addr)
  if (fam === 4) {
    if (allowRanges.some(r => inCidrV4(addr, r))) return false
    return BLOCKED_V4.some(([b, n]) => inCidrV4(addr, `${b}/${n}`))
  }
  if (fam === 6) {
    const a = addr.toLowerCase()
    if (allowRanges.includes(a)) return false
    return a === '::' || a === '::1' || /^f[cd]/.test(a) || /^fe[89ab]/.test(a) || a.startsWith('ff')
  }
  return true
}

/** Throws when url is not a public http(s) target. */
export async function assertPublicUrl(rawUrl, { allowRanges = [], resolver = lookup } = {}) {
  let url
  try { url = new URL(rawUrl) } catch { throw new Error(`Invalid URL: ${rawUrl}`) }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(`Blocked protocol: ${url.protocol}`)
  if (url.username || url.password) throw new Error('Blocked URL with embedded credentials')
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (/^(localhost|.*\.localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i.test(host)) {
    throw new Error(`Blocked host: ${host}`)
  }
  const addrs = isIP(host) ? [{ address: host }] : await resolver(host, { all: true, verbatim: true })
  if (!addrs.length) throw new Error(`Could not resolve ${host}`)
  for (const { address } of addrs) {
    if (isBlockedAddress(address, allowRanges)) throw new Error(`Blocked private address for ${host}: ${address}`)
  }
  return url
}
