#!/usr/bin/env node
/**
 * "IS A BULB DRAWN TO ITS SIZE: IN FULL ABOVE A PIXEL, AS ITS LIGHT ALONE BELOW ONE, READING THE SAME?" (Boz's (2),
 * 2026-11-02, after the PTown measurement: 5,760 bulbs × 184 triangles at the hero camera, where they are a few pixels or
 * less; Jacob's eye in Stage owed, close and far, before merge.)
 *
 *   1. THE SIZE, driven (geometry.js#bulbPx, #bulbAsCard): a bulb's projected radius is its radius × the camera's focal
 *      length in pixels ÷ its distance; under ONE pixel it is a card, at or over one it is the full bulb;
 *   2. THE CARD reads the same: a square of side r × CARD_SIDE has the light's disc area (CARD_SIDE² = π), on the light
 *      cores' OWN instance matrices and colours (shared buffers: the same place, the same colour, nothing copied);
 *   3. WIRED (LightShow.jsx, read): the choice is made each frame from the live camera (the framebuffer's height and the
 *      field of view) and the distance to the bulbs' box, for the LARGEST bulb; one place shows the light: the full cores,
 *      glass and sockets above a pixel, the cards below, and neither while unlit; the cards are drawn only as far as what
 *      hangs; the cards stay in the hero's coverage mask (they are the light).
 * Usage: node checks/claims-a-bulb-is-drawn-to-its-size.mjs [--mutants]
 */
import { importSource, sourceOf } from './_importSource.mjs'

const code = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

async function verdict({ geo, view } = {}) {
  const fails = [], F = (c, m) => { if (!c) fails.push(m) }
  const G = await importSource('src/displays/lightShow/geometry.js', geo ? { transform: geo } : {})
  // 1. the size: r 0.1 m, focal 1000 px → exactly 1 px at 100 m
  F(Math.abs(G.bulbPx(0.1, 100, 1000) - 1) < 1e-12 && Math.abs(G.bulbPx(0.1, 50, 1000) - 2) < 1e-12, `a bulb's projected radius is not radius × focal ÷ distance (${G.bulbPx(0.1, 100, 1000)})`)
  F(G.bulbAsCard(0.1, 100.5, 1000) === true && G.bulbAsCard(0.1, 100, 1000) === false && G.bulbAsCard(0.1, 10, 1000) === false, 'the card is not chosen exactly under one pixel')
  F(G.bulbAsCard(0.1, 0, 1000) === false, 'a bulb at the camera is drawn as a card')
  // 2. the card's area is the disc's
  F(Math.abs(G.CARD_SIDE * G.CARD_SIDE - Math.PI) < 1e-12, `a card of side r × CARD_SIDE (${G.CARD_SIDE}) does not have the disc's area π r²`)
  const ls = code(view ? view(sourceOf('src/displays/lightShow/LightShow.jsx')) : sourceOf('src/displays/lightShow/LightShow.jsx'))
  F(/cardAt\.xy \+= position\.xy \* length\(instanceMatrix\[0\]\.xyz\) \* \$\{CARD_SIDE\.toFixed\(6\)\}/.test(ls), 'the card is not sized by the light core\'s own radius × CARD_SIDE, facing the camera')
  F(/cardRef\.current\.instanceMatrix = coreRef\.current\.instanceMatrix/.test(ls) && /cardRef\.current\.instanceColor = coreRef\.current\.instanceColor/.test(ls), 'the cards do not share the light cores\' matrices and colours')
  // 3. wired
  F(/const cam = three\.camera, focalPx = three\.gl\.getDrawingBufferSize\(reach\.fb\)\.y \/ \(2 \* Math\.tan\(THREE\.MathUtils\.degToRad\(cam\.fov\) \/ 2\)\)/.test(ls), 'the focal length is not the live camera\'s, in framebuffer pixels')
  F(/const cards = bulbAsCard\(reach\.r, reach\.world\.distanceToPoint\(cam\.position\), focalPx\)/.test(ls) && /r = Math\.max\(r, bulbRadius\(/.test(ls), 'the choice is not made for the largest bulb at the nearest point of the bulbs\' box')
  F(/coreRef\.current\.visible = lit && !cards; glassRef\.current\.visible = !cards; socketRef\.current\.visible = !cards/.test(ls) && /cardRef\.current\.visible = lit && cards;/.test(ls), 'the full bulb and the card are not shown by one rule (full above a pixel, card below, neither unlit)')
  F(/for \(const m of \[glassRef, coreRef, socketRef, cardRef\]\) if \(m\.current\) m\.current\.count = hangs \* rows/.test(ls), 'the cards are drawn beyond what hangs')
  F(/<instancedMesh name="light-show:light-cards"(?![^>]*coverage: false)[^>]*\/>/.test(ls), 'the cards are left out of the hero\'s coverage mask (they are the light)')
  return fails
}

const run = async (m) => { try { return await verdict(m) } catch (e) { return [`it threw: ${String(e.message).slice(0, 200)}`] } }
const fails = await run()
if (fails.length) { console.log('⛔ a bulb is not drawn to its size:\n  · ' + fails.join('\n  · ')); process.exitCode = 1 }
else console.log('✅ a bulb is drawn to its size: in full at a pixel or more, its light alone as a card of the same area below, on the same matrices and colours, chosen each frame from the live camera for the largest bulb')

if (process.argv.includes('--mutants')) {
  const mutants = [
    ['the card at or over a pixel', { geo: (s) => s.replace('bulbPx(radiusM, distanceM, focalPx) < 1', 'bulbPx(radiusM, distanceM, focalPx) < 2') }],
    ['the card the core\'s radius, not its area', { geo: (s) => s.replace('export const CARD_SIDE = Math.sqrt(Math.PI)', 'export const CARD_SIDE = 2') }],
    ['the card on its own matrices', { view: (s) => s.replace('cardRef.current.instanceMatrix = coreRef.current.instanceMatrix', 'void 0') }],
    ['the choice from the smallest bulb', { view: (s) => s.replace('r = Math.max(r, bulbRadius(', 'r = Math.min(r || Infinity, bulbRadius(') }],
    ['glass kept with the cards', { view: (s) => s.replace('glassRef.current.visible = !cards;', 'glassRef.current.visible = true;') }],
    ['cards lit while unlit', { view: (s) => s.replace('cardRef.current.visible = lit && cards;', 'cardRef.current.visible = cards;') }],
    ['the cards left out of the mask', { view: (s) => s.replace('<instancedMesh name="light-show:light-cards" ref={cardRef} args={[plane, card, count]} frustumCulled={false} visible={false} />', '<instancedMesh name="light-show:light-cards" ref={cardRef} args={[plane, card, count]} frustumCulled={false} visible={false} userData={{ coverage: false }} />') }],
  ]
  let bad = 0
  for (const [name, m] of mutants) { const f = await run(m); console.log(`${f.length ? '🔴' : '⚪ SURVIVED'} mutant: ${name}${f.length ? ` (${f.length})` : ''}`); if (!f.length) bad++ }
  if (bad) process.exitCode = 1
}
