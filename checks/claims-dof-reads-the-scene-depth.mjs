#!/usr/bin/env node
// CLAIM — DEPTH OF FIELD READS THE SCENE'S DEPTH (2026-10-28, Ferrule; a REGRESSION from ab3ddb11, 2026-09-26, which put
// bloom ahead of DoF). postprocessing's composer gives its input and output buffers one depth texture, and a pass drawn
// with renderer.autoClear on clears it with its own target. @react-three/postprocessing sets gl.autoClear from the
// composer's `autoClear` prop (default on), so the first EffectPass (bloom) wiped the depth and DoF read the far plane at
// every pixel: the whole frame blurred at the Amount, whatever the focus (PTown's golden.jpg). Now:
//   (1) SOURCE: RenderPipeline mounts its EffectComposer with autoClear={false}, and it is the only EffectComposer in src/.
//   (2) SOURCE: every pass that needs a clear owns it — RenderPass (its own ClearPass, postprocessing), N8AO (it clears
//       its targets itself), HeroLadder (renderer.clear on each level); DownsamplePyramid and every EffectPass draw a
//       full-screen quad over every pixel. Listed here, read: HeroLadder still clears.
//   ⚠️ DofDebug.jsx reads the composer's depth AFTER the chain: it is the pass's depth only while (1) holds.
// THE BROWSER RECEIPT (no node process can render the composer): scratch/dof-receipts/receipt.txt, evaluated in a Stage
// tab — a REAL frame's depth at DoF equals RenderPass's at 5 points, and with the old default forced (its mutant) DoF
// reads the far plane; a magenta sentinel painted inside the frame finds no pixel left unrewritten (DoF 0, DoF 0.2, the
// debug overlay), and with the screen pass skipped finds every pixel (the sentinel's own mutant).
//   MUTANT (always run): autoClear={false} removed → (1) RED.
//   node checks/claims-dof-reads-the-scene-depth.mjs
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './_scenes.mjs'

let red = 0
const row = (ok, s) => { if (!ok) red++; console.log(`${ok ? '✅' : '⛔'} ${s}`) }
const PIPE = 'src/components/renderPipeline.jsx', src = readFileSync(join(ROOT, PIPE), 'utf8')
const judge = (s) => { const tags = s.match(/<EffectComposer\b[^>]*>/g) || []; return { tags, ok: tags.length === 1 && /\bautoClear=\{false\}/.test(tags[0]) } }
{ const J = judge(src)
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(d, e.name)) : /\.(m?js|jsx)$/.test(e.name) ? [join(d, e.name)] : [])
  const elsewhere = walk(join(ROOT, 'src')).filter(f => !f.endsWith(PIPE) && /<EffectComposer\b/.test(readFileSync(f, 'utf8').split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n'))).map(f => f.slice(ROOT.length + 1))
  row(J.ok && !elsewhere.length, `(1) the one EffectComposer mounts with autoClear={false}: ${J.tags.join(' ') || 'none found'}${elsewhere.length ? ` — another composer in ${elsewhere.join(', ')}` : ''}`) }
{ const HL = readFileSync(join(ROOT, 'src/components/HeroLadder.jsx'), 'utf8')
  row(/renderer\.clear\(true, false, false\)/.test(HL), `(2) HeroLadder clears each of its levels itself (renderer.clear): ${/renderer\.clear\(true, false, false\)/.test(HL)}`) }

// MUTANT: the source text, edited
{ const m = src.replace(' autoClear={false}', '')
  if (m === src) row(false, 'mutant (autoClear={false} removed): its anchor is not in the source — re-aim it')
  else row(!judge(m).ok, `mutant: autoClear={false} removed → ${judge(m).ok ? 'still GREEN — the row proves nothing' : 'RED as it must be'}`) }
console.log(red ? `\n⛔ ${red} row(s) RED` : '\n✅ depth of field reads the scene\'s depth')
process.exit(red ? 1 : 0)
