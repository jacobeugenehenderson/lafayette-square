/**
 * _miniflare.mjs — run one of this repo's Workers, bundled from its own source, in Miniflare against
 * an in-memory R2. For checks that must prove BEHAVIOUR, not the shape of the source.
 * ⛔ Miniflare is not a repo dependency; it is found beside the wrangler that deploys these Workers
 * (repo first, then the global install). Missing ⇒ exit 2 ("could not run"), never a pass.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

async function loadMiniflare() {
  const tries = ['miniflare']
  try { tries.push(join(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim(), 'wrangler/node_modules/miniflare')) } catch { /* reported below */ }
  for (const t of tries) {
    try {
      const spec = t.startsWith('/') ? pathToFileURL(join(t, JSON.parse(readFileSync(join(t, 'package.json'), 'utf8')).main)).href : t
      return (await import(spec)).Miniflare
    } catch { /* next */ }
  }
  console.error(`⛔ Miniflare not found (tried ${tries.join(', ')}) — install wrangler; this check never passes unrun.`)
  process.exit(2)
}

/** { mf, r2, get(url) → {status, body, cache} } for the Worker at `entry`, with `bindings` as its vars. */
export async function workerInMiniflare(entry, bindings = {}) {
  const Miniflare = await loadMiniflare()
  const bundled = await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'neutral', write: false, logLevel: 'silent' })
  const mf = new Miniflare({ modules: true, script: bundled.outputFiles[0].text, compatibilityDate: '2026-09-01', r2Buckets: ['ASSETS'], bindings })
  const r2 = await mf.getR2Bucket('ASSETS')
  const get = async (url) => { const r = await mf.dispatchFetch(url); return { status: r.status, body: await r.text(), cache: r.headers.get('cache-control') } }
  return { mf, r2, get }
}

export const mint = (tag) => `t${Math.random().toString(36).slice(2, 8)}-${tag}`
export const hex = () => Array.from({ length: 40 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('')
