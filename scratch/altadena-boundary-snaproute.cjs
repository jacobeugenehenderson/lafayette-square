// ─────────────────────────────────────────────────────────────────────────────
// ALTADENA BOUNDARY — snap-and-route pass (2026-07-12)
//
// THE PROBLEM the Extent tool kept hitting: a neighborhood boundary must be an
// enclosed polygon, but (a) the official geocoded admin ring closes yet CUTS
// THROUGH houses (it's an administrative line, blind to the street grid), and
// (b) selecting boundary STREETS follows the grid but won't close (Altadena's real
// perimeter is ~42-52 streets; only ~6 satisfy the resolver's degree-2 rule — long
// streets cross too many others → "interior", hillside/dead-ends touch too few →
// "dangling"). So neither cheat gives a usable membership boundary.
//
// THE FIX (automatable, no tool, no tapping): take the official ring as a rough
// closed region and SNAP IT TO THE STREET GRAPH:
//   official ring → sample at arc-intervals → snap each sample to the nearest
//   street node (drop samples farther than SNAP_MAX, i.e. mountain gaps) →
//   A* route between consecutive snapped corners along the street graph →
//   concatenate → Douglas-Peucker simplify → a CLOSED, STREET-FOLLOWING polygon.
// The boundary now runs on roads (never through houses); membership is centroid-
// in-polygon. Re-runnable for any hood.
//
// RESULT (Altadena, eye-gated "looks good" 2026-07-12): 543-vert admin ring →
// ~148 corners → routed → 628-vert boundary; 16,434 buildings included vs the
// admin ring's 18,718 (routed is tighter: drops ~2,518 up-canyon/fringe blocks the
// streets don't reach). Artifact map: buildings colored by membership.
//
// STATUS: analysis pass — writes the polygon to /tmp, does NOT touch Altadena's
// real data. Wiring into the pour (commit-extent membership = this polygon) is the
// next step. Membership polygon may include mountain — fine, no buildings there;
// the circle/radius is the separate visual extent; DON'T clip.
//
// RUN: `node scratch/altadena-boundary-snaproute.js` from repo root (needs the
// cartograph backend on :3333 for the geocode, and data/altadena/clean/skeleton.json).
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const http = require('http');

const SCENE = 'altadena';
const SAMPLE_STEP = 120;   // m between ring samples (denser → less shortcutting)
const SNAP_MAX = 130;      // m; drop a sample if the nearest street is farther (mountain gap)
const DP_EPS = 22;         // m; Douglas-Peucker simplify tolerance

const base = `cartograph/data/${SCENE}`;
const skel = JSON.parse(fs.readFileSync(`${base}/clean/skeleton.json`, 'utf8'));
const geo = JSON.parse(fs.readFileSync(`${base}/geography.json`, 'utf8'));

function geocode(q) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ q });
    const req = http.request({ host: 'localhost', port: 3333, path: '/geocode', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d))); });
    req.on('error', reject); req.write(body); req.end();
  });
}
const wgs = (lon, lat) => ({ x: (lon - geo.lon) * geo.lonToMeters, z: (geo.lat - lat) * geo.latToMeters });

(async () => {
  const gc = await geocode('Altadena');
  const ring = gc.official.ring.map(([lon, lat]) => wgs(lon, lat));

  // street graph: nodes = 1m-quantized points, edges = chain segments
  const KEY = p => `${Math.round(p.x)},${Math.round(p.z)}`;
  const adj = new Map(), coord = new Map();
  const addEdge = (a, b) => { const ka = KEY(a), kb = KEY(b); if (ka === kb) return;
    coord.set(ka, { x: a.x, z: a.z }); coord.set(kb, { x: b.x, z: b.z });
    const w = Math.hypot(a.x - b.x, a.z - b.z);
    (adj.get(ka) || adj.set(ka, []).get(ka)).push([kb, w]);
    (adj.get(kb) || adj.set(kb, []).get(kb)).push([ka, w]); };
  for (const s of skel.streets) { const p = s.points; if (!p || p.length < 2) continue; for (let i = 0; i + 1 < p.length; i++) addEdge(p[i], p[i + 1]); }
  const nodes = [...coord.entries()].map(([k, c]) => ({ k, x: c.x, z: c.z }));

  // grid index → nearest node
  const CELL = 120, grid = new Map();
  for (const n of nodes) { const k = `${Math.floor(n.x / CELL)},${Math.floor(n.z / CELL)}`; (grid.get(k) || grid.set(k, []).get(k)).push(n); }
  const nearest = (x, z) => { let best = null, bd = Infinity; for (let r = 0; r < 25; r++) { for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) { if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue; const c = grid.get(`${Math.floor(x / CELL) + di},${Math.floor(z / CELL) + dj}`); if (!c) continue; for (const n of c) { const d = Math.hypot(n.x - x, n.z - z); if (d < bd) { bd = d; best = n; } } } if (best && r >= Math.ceil(bd / CELL) + 1) break; } return best ? { node: best, d: bd } : null; };

  // sample the ring + snap
  const samples = [ring[0]]; { let acc = 0; for (let i = 1; i < ring.length; i++) { acc += Math.hypot(ring[i].x - ring[i - 1].x, ring[i].z - ring[i - 1].z); if (acc >= SAMPLE_STEP) { samples.push(ring[i]); acc = 0; } } }
  const snaps = []; let dropped = 0;
  for (const s of samples) { const r = nearest(s.x, s.z); if (!r || r.d > SNAP_MAX) { dropped++; continue; } if (!snaps.length || snaps[snaps.length - 1].k !== r.node.k) snaps.push(r.node); }

  // A* between consecutive corners
  class Heap { constructor() { this.a = []; } push(x) { const a = this.a; a.push(x); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break;[a[p], a[i]] = [a[i], a[p]]; i = p; } } pop() { const a = this.a, t = a[0], l = a.pop(); if (a.length) { a[0] = l; let i = 0; for (;;) { let L = 2 * i + 1, R = L + 1, m = i; if (L < a.length && a[L][0] < a[m][0]) m = L; if (R < a.length && a[R][0] < a[m][0]) m = R; if (m === i) break;[a[m], a[i]] = [a[i], a[m]]; i = m; } } return t; } get size() { return this.a.length; } }
  const astar = (sK, dK) => { const dst = coord.get(dK); const h = k => { const c = coord.get(k); return Math.hypot(c.x - dst.x, c.z - dst.z); }; const g = new Map([[sK, 0]]), prev = new Map(), pq = new Heap(), done = new Set(); pq.push([h(sK), sK]); while (pq.size) { const [, u] = pq.pop(); if (done.has(u)) continue; done.add(u); if (u === dK) break; const gu = g.get(u); for (const [v, w] of (adj.get(u) || [])) { const ng = gu + w; if (ng < (g.get(v) ?? Infinity)) { g.set(v, ng); prev.set(v, u); pq.push([ng + h(v), v]); } } } if (!prev.has(dK) && sK !== dK) return null; const path = [dK]; let c = dK; while (c !== sK) { c = prev.get(c); if (c == null) return null; path.push(c); } return path.reverse(); };

  const poly = []; let routed = 0, failed = 0;
  for (let i = 0; i < snaps.length; i++) { const path = astar(snaps[i].k, snaps[(i + 1) % snaps.length].k); if (!path) { failed++; poly.push(coord.get(snaps[i].k)); continue; } routed++; for (let j = 0; j < path.length - 1; j++) poly.push(coord.get(path[j])); }

  // Douglas-Peucker
  const dp = (pts, eps) => { if (pts.length < 3) return pts; let dmax = 0, idx = 0; const a = pts[0], b = pts[pts.length - 1]; const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1; for (let i = 1; i < pts.length - 1; i++) { const p = pts[i]; const d = Math.abs((p.x - a.x) * dz - (p.z - a.z) * dx) / L; if (d > dmax) { dmax = d; idx = i; } } if (dmax > eps) { return dp(pts.slice(0, idx + 1), eps).slice(0, -1).concat(dp(pts.slice(idx), eps)); } return [a, b]; };
  const simp = dp(poly, DP_EPS);

  // building membership (centroids from pre-projected x/z)
  const m = JSON.parse(fs.readFileSync(`${base}/raw/msbf.json`, 'utf8'));
  const pip = (x, z, pg) => { let c = false; for (let i = 0, j = pg.length - 1; i < pg.length; j = i++) { const [xi, zi] = [pg[i].x, pg[i].z], [xj, zj] = [pg[j].x, pg[j].z]; if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) c = !c; } return c; };
  let inR = 0; for (const b of m.buildings) { let sx = 0, sz = 0, n = 0; for (const c of b.coords) if (c.x != null) { sx += c.x; sz += c.z; n++; } if (n && pip(sx / n, sz / n, simp)) inR++; }

  console.log(`snap: ${samples.length} samples, ${dropped} dropped -> ${snaps.length} corners; routed ${routed}/${snaps.length} (failed ${failed})`);
  console.log(`boundary: ${poly.length} raw -> ${simp.length} simplified verts`);
  console.log(`buildings included: ${inR} of ${m.buildings.length}`);
  fs.writeFileSync('/tmp/alt_boundary_poly.json', JSON.stringify(simp.map(p => [Math.round(p.x), Math.round(p.z)])));
  console.log('wrote /tmp/alt_boundary_poly.json');
})();
