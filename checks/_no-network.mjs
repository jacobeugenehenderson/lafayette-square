/**
 * THE NETWORK IS OFF, AND IT IS OFF BY CONSTRUCTION — not by a promise in a doc.
 *
 * Preloaded (`node --import`) into every check `npm test` runs. Any attempt to reach the network
 * throws, naming the call site. So "the safe tier contacts nothing" is not a claim someone verified
 * once by reading 124 files — it is enforced on every run, including on the check somebody adds
 * next month without reading any of this.
 *
 * ⛔ THE POINT IS THE BACKSTOP, NOT THE BELT. `checks/tier.mjs` already excludes anything that can
 *    be seen to reach out; this catches what a source parser CANNOT see — a transitive call through
 *    a package, a lazily-required module, an SDK that dials on first use. The classifier is the
 *    gate; this is the proof the gate held.
 *
 * ⭐ It fails LOUD (`CLAUDE.md` Layer 0 q2). It never returns a stub, an empty body, or a cached
 *    response — a check that silently "passes" because its fetch was neutered is worse than one
 *    that did not run, because it reports a green it did not earn.
 */
const BLOCKED = (what, detail) => {
  const e = new Error(
    `⛔ NETWORK BLOCKED — a check in the \`safe\` tier tried to ${what}${detail ? `: ${detail}` : ''}.\n` +
    `   The safe tier must contact nothing. Either this check does not belong in it (re-run\n` +
    `   \`node checks/tier.mjs\` and see why it was tiered safe — that is a classifier hole worth\n` +
    `   reporting), or the call is new. ⛔ Do not "fix" this by loosening the guard.`)
  e.code = 'CHECKS_NETWORK_BLOCKED'
  return e
}

globalThis.fetch = () => { throw BLOCKED('call fetch()') }
if (globalThis.WebSocket) globalThis.WebSocket = function () { throw BLOCKED('open a WebSocket') }
if (globalThis.XMLHttpRequest) globalThis.XMLHttpRequest = function () { throw BLOCKED('use XMLHttpRequest') }

// The socket layer is the floor: every http/https/undici/pg/SDK path lands here eventually, so
// guarding it catches transports this file has never heard of.
// ⛔ Via createRequire: an ESM namespace object is frozen, so `import * as dns` cannot be patched.
//    The CJS handle is the same module object, and it is writable.
const { createRequire } = await import('node:module')
const require_ = createRequire(import.meta.url)
const net = require_('node:net')
const origConnect = net.Socket.prototype.connect
net.Socket.prototype.connect = function (...args) {
  const a = args[0]
  const where = typeof a === 'object' && a ? (a.host ?? a.path ?? '') : String(a ?? '')
  // A unix-domain socket is not the network; blocking it would break unrelated local tooling.
  if (typeof a === 'object' && a && a.path) return origConnect.apply(this, args)
  throw BLOCKED('open a socket', String(where))
}
const dns = require_('node:dns')
for (const m of ['lookup', 'resolve', 'resolve4', 'resolve6']) {
  if (dns[m]) dns[m] = () => { throw BLOCKED(`resolve DNS (${m})`) }
  if (dns.promises?.[m]) dns.promises[m] = () => { throw BLOCKED(`resolve DNS (${m})`) }
}
