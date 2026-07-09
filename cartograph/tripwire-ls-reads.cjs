/**
 * tripwire-ls-reads.cjs — preload that flags LS-specific file access during a
 * NON-LS bake. Any read of `src/data/…` or `cartograph/data/lafayette-square/…`
 * while baking another scene is a hardwire (the LS-fallback bug class).
 *
 *   NODE_OPTIONS="--require ./cartograph/tripwire-ls-reads.cjs" \
 *   node cartograph/bake-X.js --look=hipointe-demun --scene=hipointe-demun
 *
 * Logs (does not throw) so ONE run surfaces every hardwire, not just the first.
 * readFileSync = a real data hardwire (LS bytes used). existsSync = a guard
 * check (often benign — a `scene===DEFAULT ? LS : scene` branch). CI gate later
 * flips log→throw. Emits [TRIPWIRE] lines to stderr.
 */
const fs = require('fs')
const path = require('path')
const CWD = process.cwd()

const isLS = (p) => {
  const s = String(p)
  return s.includes(`${path.sep}src${path.sep}data${path.sep}`) ||
         s.includes(`${path.sep}data${path.sep}lafayette-square${path.sep}`)
}
const rel = (p) => String(p).replace(CWD + path.sep, '')
const caller = () => {
  const frames = (new Error().stack || '').split('\n').slice(2)
  for (const line of frames) {
    if (line.includes('tripwire-ls-reads')) continue
    const m = line.match(/\(?((?:\/[^\s():]+)\.(?:c?js|mjs)):(\d+):\d+\)?/)
    if (m && (m[1].includes('/cartograph/') || m[1].includes('/src/')))
      return `${rel(m[1])}:${m[2]}`
  }
  return '(unknown)'
}

const seen = new Set()
const wrap = (obj, name) => {
  const orig = obj[name]
  obj[name] = function (p, ...rest) {
    if (isLS(p)) {
      const key = name + '|' + String(p)
      if (!seen.has(key)) {
        seen.add(key)
        process.stderr.write(`[TRIPWIRE] ${name.padEnd(13)} ${rel(p)}  <- ${caller()}\n`)
      }
    }
    return orig.apply(this, [p, ...rest])
  }
}
wrap(fs, 'readFileSync')
wrap(fs, 'existsSync')
