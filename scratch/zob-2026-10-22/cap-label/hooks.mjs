import { readFileSync } from 'fs'
export async function load(url, ctx, next) {
  if (!url.endsWith('/src/lib/tileGround.js')) return next(url, ctx)
  let src = readFileSync(new URL(url), 'utf8')
  const A = 'const caps = [], capIx = new Map(), iaCap = mine.map(EC => new Array(EC.ring.length).fill(null))'
  if (src.split(A).length !== 2) throw new Error('anchor not unique')
  src = src.replace(A, A + '; (globalThis.__ec ||= []).push(...mine.map(EC => ({ ring: EC.ring, labs: EC.labs })))')
  return { format: 'module', source: src, shortCircuit: true }
}
