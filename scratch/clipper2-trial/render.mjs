// render.mjs — pictures for Jacob: the Clipper2 trials' most telling sites, SVGs beside pictures/index.html.
// Every site is recomputed here from in-<scene>.json (the pour's ② input, authoring loaded) — nothing is drawn from memory.
// x right, z DOWN the page (the scene's local frame as stored).
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { c2Offset } from './c2.mjs'
import { offsetRingByRects } from './tileGround.probe.mjs'
const OUT = new URL('./pictures/', import.meta.url); mkdirSync(OUT, { recursive: true })
const IN = {}; const inp = (s) => IN[s] || (IN[s] = JSON.parse(readFileSync(new URL(`./in-${s}.json`, import.meta.url), 'utf8')))
const W = 640
const svg = (at, R, layers, note) => {
  const sx = (x) => ((x - at[0] + R) / (2 * R) * W).toFixed(2), sy = (z) => ((z - at[1] + R) / (2 * R) * W).toFixed(2)
  const path = (rings) => rings.map(r => 'M' + r.map(p => `${sx(p[0])},${sy(p[1])}`).join('L') + 'Z').join('')
  const line = (a, b) => `M${sx(a[0])},${sy(a[1])}L${sx(b[0])},${sy(b[1])}`
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${W}" width="${W}" height="${W}"><rect width="${W}" height="${W}" fill="#fff"/>`
  for (const L of layers) {
    if (L.rings) s += `<path d="${path(L.rings)}" fill="${L.fill || 'none'}" fill-rule="evenodd" stroke="${L.stroke || 'none'}" stroke-width="${L.w || 1.5}" ${L.dash ? `stroke-dasharray="${L.dash}"` : ''} opacity="${L.op ?? 1}"/>`
    if (L.segs) for (const [a, b, c] of L.segs) s += `<path d="${line(a, b)}" stroke="${c}" stroke-width="${L.w || 3}" fill="none"/>`
    if (L.pts) for (const p of L.pts) s += `<circle cx="${sx(p[0])}" cy="${sy(p[1])}" r="${L.r || 3}" fill="${L.c}"/>`
  }
  const bar = Math.pow(10, Math.floor(Math.log10(R))), bw = bar / (2 * R) * W
  s += `<path d="M20,${W - 20}h${bw.toFixed(1)}" stroke="#000" stroke-width="2"/><text x="20" y="${W - 26}" font-family="sans-serif" font-size="12">${bar >= 1 ? bar + ' m' : bar * 1000 + ' mm'}</text>`
  s += `<circle cx="${W / 2}" cy="${W / 2}" r="5" fill="none" stroke="#c00" stroke-width="1"/>`
  return s + `</svg>`
}
const KEY_T2 = `<span style="color:#999">■ ① block (the offset's input)</span> · <b>━ ours</b> (offsetRingByRects, ease off) · <span style="color:#e67e00">┅ Clipper2 vertex</span> · <span style="color:#1f5fd6">━ Clipper2 stub-min</span> · <span style="color:#1a9e48">━ Clipper2 stub-max</span>`
const t2site = (scene, k, h, at, R) => {
  const b = inp(scene).blocks.find(x => x.k === k), c = h >= 0 ? b.holes[h] : b, out = h >= 0
  const ours = offsetRingByRects(c.ring, (j) => c.depth[j], out, {}, null, 0.005, { e: c.e, v: c.v, hwy: c.hwy, own: c.own })
  return svg(at, R, [{ rings: [c.ring], fill: '#eee', stroke: '#bbb', w: 1 },
    { rings: c2Offset(c.ring, c.depth, out, 'vertex'), stroke: '#e67e00', dash: '6 4', w: 2 },
    { rings: c2Offset(c.ring, c.depth, out, 'stub-min'), stroke: '#1f5fd6', w: 2.5 },
    { rings: c2Offset(c.ring, c.depth, out, 'stub-max'), stroke: '#1a9e48', w: 1.5 },
    { rings: ours, stroke: '#000', w: 1, op: 0.9 }])
}
const sites = []
const add = (id, title, body, svgText) => { writeFileSync(new URL(`${id}.svg`, OUT), svgText); sites.push({ id, title, body }) }
// ① — the per-vertex callback at an ordinary corner
add('1-ls-corner-vertex-mode', 'LS · block 229 · a strip narrower than its two curbs (South Tucker Blvd 6.17 m · Park Ave 2.22 m)',
  `Clipper2's DeltaCallback is asked once per <i>vertex</i>; our depth is per <i>edge</i>. Here ours and both stub modes (each edge fed with its own depth) have nothing near the corner: the strip is narrower than its curbs, so ② goes to zero (their nearest pieces are off the top of the frame). The vertex mode (orange: each vertex given its edge's start depth) keeps a 1–3 m sliver; the nearest point of ours is 112.7 m from it. Across all towns, at ordinary street corners the vertex mode's local Hausdorff is p50 1.4–2.0 m, stub modes 0.001 m. ▶ t2-*.out`,
  t2site('lafayette-square', 229, -1, [1023.6, 128.1], 30))
add('2-hpdm-street-jog', 'HPDM · block 275 · South Hanley Rd → Eager Rd, a 24.4° turn with a width change (8.38 → 1.68 m)',
  `The largest street-seam disagreement in any town: 6.498 m, both stub modes. Where the two curb lines meet outside the corner, ours draws the chord between the two bands' ends (<code>offsetRingByRects</code>: the miter only when the apex lies in the corner's cone); Clipper2 has no such rule. Whether that rule is what this picture shows: cause not established.`,
  t2site('hipointedemun', 275, -1, [-2182.8, 1490.1], 25))
add('3-hpdm-highway-jog', 'HPDM · block 385 · Inner Belt Expressway → motorway link (4.26 → 1.82 m, 6.8° turn)',
  `A ramp-side strip narrower than its curbs. Clipper2 (blue/green) keeps a thin sliver at the site; ours (black) keeps different slivers, the nearest 70.06 m along. Both edges are highway-owned: their depths are H-3's placeholder inside the highway polygon, which the pour subtracts afterwards, and our join there runs the curb line on to the miter by rule (<code>hwyJoin</code>). This trial compares before that subtraction; what survives it was not measured, and why the two keep different slivers: cause not established.`,
  t2site('hipointedemun', 385, -1, [-3000.4, 1101.6], 90))
add('4-huron-rim-corner', 'Huron · block 0 · Scheid Rd → the map rim (depth 5.49 → 0)',
  `A rim edge has depth 0. At a vertex given 0, Clipper2 emits the input vertex itself (<code>|delta| &lt; Tolerance</code> → <code>pathOut.push(path[j])</code>), so stub-min (blue) pulls the curb back to the ① corner: 5.485 m off ours. stub-max (green) gives the street's own depth there and matches ours (0.000 m).`,
  t2site('huron', 0, -1, [-4944.6, 4945.1], 14))
// ⑤ T3 — an edge whose two ends name no common owner
{ const t3 = JSON.parse(readFileSync(new URL('./t3-huron.json', import.meta.url), 'utf8'))
  const ex = t3.examples.eNone.find(x => x.k === 8) || t3.examples.eNone[0]
  const b = inp('huron').blocks.find(x => x.k === ex.k)
  const st = {}; offsetRingByRects(b.ring, (j) => b.depth[j], false, st, null, 0.005, { e: b.e, v: b.v, hwy: b.hwy, own: b.own })
  const at = ex.q, R = 12
  add('5-huron-t3-no-owner', `Huron · block ${ex.k} · T3: a ${Math.hypot(ex.q[0] - ex.p[0], ex.q[1] - ex.p[1]).toFixed(0)} m rim edge that Clipper2's Z leaves with no owner`,
    `Red: the carve's output edge along the map rim. Its far end carries ${ex.owners[0]}; this end is the corner of ${ex.owners[1]}'s band, so the Z of that vertex names only the band. The two ends share no owner, so the edge has none. That is the case <code>offsetRingByRects</code>'s own comment gives for labelling by containment instead of vertex Z ("two bands share their corner points"). Grey: ①; thin: the carve's bands and wedges.`,
    svg(at, R, [{ rings: [b.ring], fill: '#eee', stroke: '#bbb', w: 1 }, { rings: st._carve.clips, stroke: '#888', w: 0.7 },
      { rings: st._carve.rawRings, stroke: '#000', w: 1 }, { segs: [[ex.p, ex.q, '#d00']], w: 4 }, { pts: [ex.q], c: '#d00', r: 5 }])) }
// tips
for (const [scene, pick] of [['lafayette-square', 0], ['hipointedemun', 3]]) {
  const S = JSON.parse(readFileSync(new URL(`./t2-tips-sites-${scene}.json`, import.meta.url), 'utf8'))[pick]
  const R = 0.012
  add(`tip-${scene}`, `Dead-end tip · ${scene} · ${S.skelId} (${S.end})`,
    `ε = 5 mm hairline, the chain end at the red circle, drawn at millimetres. Black: ours (<code>mintProtopolygon</code>: a hand stroke with a butt end through the end point). Orange: Clipper2 Butt (the same). Blue: Square (the end ε further out). Green: Round (a 26-vertex arc ε further out, every edge shorter than ②'s 8 mm fold, so ② and the cap see no cap edge).`,
    svg(S.E, R, [{ rings: S.Round, stroke: '#1a9e48', w: 2 }, { rings: S.Square, stroke: '#1f5fd6', w: 2 }, { rings: S.Butt, stroke: '#e67e00', w: 3, dash: '5 3' }, { rings: S.ours, stroke: '#000', w: 1 }]))
}
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Clipper2 trials</title>
<style>body{font:15px/1.45 -apple-system,sans-serif;max-width:720px;margin:24px auto;padding:0 16px;color:#111;background:#fff}h1{font-size:22px}h2{font-size:16px;margin-top:32px}img{width:100%;max-width:640px;border:1px solid #ddd}code{font-size:13px}.k{font-size:13px;color:#333}</style></head><body>
<h1>Clipper2 trials: the telling sites</h1>
<p class="k">Recomputed from the pour's own ② input with authoring loaded (scratch/clipper2-trial). Numbers: t2-*.out, t3-*.out, t2-tips-*.out, t2-tangent.out. Red circle = the site.</p>
<p class="k">${KEY_T2}</p>
${sites.map(s => `<h2>${s.title}</h2><img src="${s.id}.svg" alt="${s.title}"><p>${s.body}</p>`).join('\n')}
</body></html>`
writeFileSync(new URL('index.html', OUT), html)
console.log(`wrote ${sites.length} pictures + index.html`)
