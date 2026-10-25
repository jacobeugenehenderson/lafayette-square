// serve tileGround.js with a counter on the densifier's off-arc leg end (in memory; the worktree is never written)
import { readFileSync } from 'fs'
export async function load(url, ctx, next) {
  if (!url.endsWith('/src/lib/tileGround.js')) return next(url, ctx)
  let src = readFileSync(new URL(url), 'utf8')
  const A = '      return M(p.ri, back) !== M(p.ri, v)\n    }'
  if (src.split(A).length !== 2) throw new Error('anchor not unique')
  src = src.replace(A, `      { const ch = M(p.ri, back) !== M(p.ri, v); if (ch) { const G = (globalThis.__legEnd ||= { seen: new WeakMap(), n: 0, same: 0, sameCorner: 0, diff: 0, diffCorner: 0, at: [] })
        let s = G.seen.get(st); if (!s) G.seen.set(st, s = new Set()); const key = p.ri + '|' + v
        if (!s.has(key)) { s.add(key); G.n++; const same = sameLadder(M(p.ri, back), M(p.ri, v)), corner = !!st.iaCorner?.[p.si]?.[v]
          if (same) { G.same++; if (corner) G.sameCorner++; else if (G.at.length < 5) G.at.push(p.ring?.[v] || v) } else { G.diff++; if (corner) G.diffCorner++ } } }
        return ch }
    }`)
  return { format: 'module', source: src, shortCircuit: true }
}
