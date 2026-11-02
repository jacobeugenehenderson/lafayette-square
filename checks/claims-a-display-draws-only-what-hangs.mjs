#!/usr/bin/env node
/**
 * "DOES THE LIGHT SHOW DRAW ONLY WHAT HANGS, AND NOTHING WHILE IT IS DARK?" (Boz's (3), 2026-11-02, after the PTown frame
 * measurement: 5,760 bulbs × 184 triangles drawn lit or not; Zob's 2a: "hide the root when nothing hangs; skip colouring
 * while off".) No visual change: only what could not be seen stops being drawn.
 *
 *   1. THE ORDER (geometry.js#strandOrder, driven): the glow's strands first, then the rest; every strand once; so the first
 *      (glow strands × rows) instances are exactly the glow's bulbs, and a draw count can stop there;
 *   2. WIRED (LightShow.jsx, read): each mesh's draw count is what hangs (all in a show, the glow's at glow, none out of
 *      season); every instance is placed and coloured at its ORDERED index; the colouring walks only the strands that hang;
 *      out of season the whole display is not submitted; off (hung by day, or Stage's Off) the light cores are hidden and
 *      not coloured until lit; the pinnacle is washed only in a show.
 * Usage: node checks/claims-a-display-draws-only-what-hangs.mjs [--mutants]
 */
import { importSource, sourceOf } from './_importSource.mjs'

const code = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

async function verdict({ geo, view } = {}) {
  const fails = [], F = (c, m) => { if (!c) fails.push(m) }
  const G = await importSource('src/displays/lightShow/geometry.js', geo ? { transform: geo } : {})
  for (const [n, every] of [[60, 4], [48, 3], [12, 1]]) {
    const isGlow = (s) => s % every === Math.floor(every / 2), o = G.strandOrder(n, isGlow)
    const want = Array.from({ length: n }, (_, s) => s).filter(isGlow)
    F(JSON.stringify(o.glow) === JSON.stringify(want), `${n} strands, every ${every}: the glow's strands are not ${want.length} in their order (${o.glow})`)
    F(o.all.length === n && new Set(o.all).size === n && o.all.slice(0, o.glow.length).every(isGlow), `${n} strands, every ${every}: the order is not every strand once, the glow's first`)
    F(o.all.every((s, k) => o.pos[s] === k), `${n} strands, every ${every}: a strand's place is not where the order puts it`)
    const rows = 7, firstGlow = new Set(Array.from({ length: o.glow.length * rows }, (_, i) => o.all[Math.floor(i / rows)]))
    F([...firstGlow].every(isGlow) && firstGlow.size === o.glow.length, 'the first (glow strands × rows) instances are not exactly the glow\'s bulbs')
  }
  const ls = code(view ? view(sourceOf('src/displays/lightShow/LightShow.jsx')) : sourceOf('src/displays/lightShow/LightShow.jsx'))
  F(/const order = useMemo\(\(\) => strandOrder\(ends\.length, isGlow\)/.test(ls), 'LightShow does not order its instances through strandOrder')
  F(/const hangs = hang === 'all' \? order\.all\.length : hang === 'glow' \? order\.glow\.length : 0\s*for \(const m of \[glassRef, coreRef, socketRef, cardRef\]\) if \(m\.current\) m\.current\.count = hangs \* rows[^\n]*\n\s*cordRef\.current\.count = hangs/.test(ls), 'LightShow does not stop each mesh\'s draw count at what hangs')
  F(/put\(cordRef\.current, order\.pos\[s\],/.test(ls) && /const i = order\.pos\[s\] \* rows \+ j/.test(ls) && /coreRef\.current\.setColorAt\(order\.pos\[s\] \* rows \+ j, tmp\.c\)/.test(ls) && !/(put\(\w+Ref\.current, |setColorAt\()s \* rows \+ j/.test(ls), 'LightShow places or colours an instance at its unordered index')
  F(/for \(const s of hang === 'all' \? order\.all : order\.glow\) \{/.test(ls), 'LightShow colours strands that do not hang')
  F(/root\.current\.visible = hang !== 'none'/.test(ls), 'out of season the display is still submitted')
  F(/if \(!show && \(mode === 'off' \|\| hang === 'none'\)\) \{\s*if \(!unlit\.current\) \{ unlit\.current = true; showLight\(\);[^}]*\}\s*return\s*\}/.test(ls) && /if \(unlit\.current\) \{ unlit\.current = false; showLight\(\) \}/.test(ls) && /const part = bulbParts\(!unlit\.current, asCards\.current\)\s*coreRef\.current\.visible = part\.core;/.test(ls), 'while off the light cores are still drawn and coloured, or never come back when lit')
  F(/if \(show && pinRef\.current && pinFaces\) pinFaces\.forEach/.test(ls), 'the pinnacle is washed outside a show')
  // Boz, 2026-11-02 (Jacob: "the strands aren't even showing when they're turned off"): in season and off, the strands hang as
  // they are, at every size; out of season nothing is submitted
  F([true, false].every(cards => { const p = G.bulbParts(false, cards); return p.glass && p.socket && !p.core && !p.card }), 'in season and off, the strands\' glass and sockets are not drawn at every size')
  F(!/cordRef\.current\.visible\s*=/.test(ls), 'the cords are hidden by something other than the root (out of season)')
  return fails
}

const run = async (m) => { try { return await verdict(m) } catch (e) { return [`it threw: ${String(e.message).slice(0, 200)}`] } }
const fails = await run()
if (fails.length) { console.log('⛔ the display draws more than hangs:\n  · ' + fails.join('\n  · ')); process.exitCode = 1 }
else console.log('✅ the display draws only what hangs: its instances ordered glow first, each draw count stopped at what hangs, nothing out of season, the light cores hidden and uncoloured while off, the pinnacle only in a show')

if (process.argv.includes('--mutants')) {
  const mutants = [
    ['the rest ordered first', { geo: (s) => s.replace('const all = [...glow, ...rest], pos = new Array(n)', 'const all = [...rest, ...glow], pos = new Array(n)') }],
    ['every strand drawn (no count)', { view: (s) => s.replace('for (const m of [glassRef, coreRef, socketRef, cardRef]) if (m.current) m.current.count = hangs * rows', 'void hangs') }],
    ['an instance at its unordered index', { view: (s) => s.replace('const i = order.pos[s] * rows + j', 'const i = s * rows + j') }],
    ['colouring every strand at glow', { view: (s) => s.replace("for (const s of hang === 'all' ? order.all : order.glow) {", 'for (const s of order.all) {') }],
    ['submitted out of season', { view: (s) => s.replace("root.current.visible = hang !== 'none'", 'root.current.visible = true') }],
    ['colouring while off', { view: (s) => s.replace("if (!show && (mode === 'off' || hang === 'none')) {", 'if (false) {') }],
    ['off: the strands gone far off', { geo: (s) => s.replace('glass: !(lit && cards), socket: !(lit && cards)', 'glass: !cards, socket: !cards') }],
    ['off: the cords hidden', { view: (s) => s.replace('coreRef.current.visible = part.core;', 'coreRef.current.visible = part.core; cordRef.current.visible = !unlit.current;') }],
    ['the pinnacle washed every frame', { view: (s) => s.replace('if (show && pinRef.current && pinFaces) pinFaces.forEach', 'if (pinRef.current && pinFaces) pinFaces.forEach') }],
  ]
  let bad = 0
  for (const [name, m] of mutants) { const f = await run(m); console.log(`${f.length ? '🔴' : '⚪ SURVIVED'} mutant: ${name}${f.length ? ` (${f.length})` : ''}`); if (!f.length) bad++ }
  if (bad) process.exitCode = 1
}
