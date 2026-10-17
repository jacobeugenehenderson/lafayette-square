// guard.mjs — node --import <this>: every fs write outside WRITE_ALLOW (a ':'-list of absolute dirs) THROWS, and every
// write inside it is logged to stderr as `[guard] write <fn> <path>`. Patches fs and fs/promises, then syncs the ESM
// named exports so `import { writeFileSync } from 'fs'` sees the guard too. The run's proof that the tree is the only
// place it wrote; the after-check against the LS manifest is the other half.
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import { resolve } from 'node:path'
const allow = (process.env.WRITE_ALLOW || '').split(':').filter(Boolean).map(d => resolve(d) + '/')
if (!allow.length) throw new Error('[guard] WRITE_ALLOW is empty — refusing to run unguarded')
const check = (fn, p) => {
  if (typeof p !== 'string' && !(p instanceof URL) && !Buffer.isBuffer(p)) return   // a file descriptor: opened through a checked call
  const abs = resolve(p instanceof URL ? p.pathname : String(p))
  if (!allow.some(d => abs.startsWith(d))) throw new Error(`[guard] ⛔ ${fn} outside WRITE_ALLOW: ${abs}`)
  process.stderr.write(`[guard] write ${fn} ${abs}\n`)
}
const PATH1 = ['writeFileSync', 'appendFileSync', 'mkdirSync', 'rmSync', 'rmdirSync', 'unlinkSync', 'utimesSync', 'truncateSync', 'chmodSync', 'createWriteStream',
  'writeFile', 'appendFile', 'mkdir', 'rm', 'rmdir', 'unlink', 'utimes', 'truncate', 'chmod']
const PATH2 = ['renameSync', 'copyFileSync', 'cpSync', 'symlinkSync', 'linkSync', 'rename', 'copyFile', 'cp', 'symlink', 'link']
const WFLAG = /[wa+]/
for (const mod of [fs, fsp]) {
  for (const k of PATH1) if (typeof mod[k] === 'function') { const o = mod[k]; mod[k] = function (p, ...a) { check(k, p); return o.call(this, p, ...a) } }
  for (const k of PATH2) if (typeof mod[k] === 'function') { const o = mod[k]; mod[k] = function (s, d, ...a) { check(k, d); return o.call(this, s, d, ...a) } }
  for (const k of ['openSync', 'open']) if (typeof mod[k] === 'function') { const o = mod[k]; mod[k] = function (p, f, ...a) { if (typeof f === 'string' && WFLAG.test(f) || typeof f === 'number' && (f & 3)) check(k, p); return o.call(this, p, f, ...a) } }
}
syncBuiltinESMExports()
