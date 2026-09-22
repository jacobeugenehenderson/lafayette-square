/**
 * The town's mark, drawn. One component so every badge agrees.
 *
 * ⛔ Three kinds, and the third is the point: `emoji` (authored), `svg` (a town that owns
 * a real mark — today only Lafayette Square's arch), and `initial` for a town that has
 * authored nothing. ⛔ There is deliberately no fourth case that borrows someone else's
 * mark; an unauthored town must LOOK unauthored. (`src/lib/townMark.js`.)
 */
import React from 'react'
import { townMark } from '../lib/townMark.js'
import RoleBadge from './RoleBadge'

/**
 * ⭐ THE BADGE IS THE KIT'S EXISTING ONE, NOT A NEW MOTIF. `RoleBadge` already seats a mark
 * in a glass circle — radial highlight, inset rim, hairline border — and an emoji hung in
 * open space reads as unfinished next to it (Jacob, 2026-09-21: the anchor "is kind of just
 * dangling out there"). Reusing that treatment means the load screen, the visitor avatar
 * and the tab all speak one language, and a town that authors a glyph gets all three.
 * ⛔ Values copied from `RoleBadge`'s `visitor` theme; if that changes, change it there and
 * here together, or the two badges drift apart on the same screen.
 */
const GLASS = {
  background: 'radial-gradient(circle at 40% 35%, rgba(255,255,255,0.10) 0%, transparent 100%)',
  boxShadow: 'inset 0 0.5px 1px rgba(255,255,255,0.15), inset 0 -1px 2px rgba(0,0,0,0.2)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: '9999px',
}

export default function TownMarkGlyph({ size = 32, style, className = '', badge = false }) {
  const mark = townMark()
  if (mark.kind === 'svg') {
    // Today the only authored SVG mark is LS's arch, which RoleBadge already draws.
    return <RoleBadge role="visitor" size={Math.round(size / 4)} className={className} />
  }
  const glyph = (
    <span
      role="img"
      aria-label={mark.kind === 'emoji' ? 'town mark' : `town initial ${mark.value}`}
      className={className}
      style={{
        fontSize: mark.kind === 'emoji' ? size : Math.round(size * 0.62),
        lineHeight: 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        // An initial is a placeholder and should read as one — no colour of its own.
        fontWeight: mark.kind === 'initial' ? 600 : 400,
        opacity: mark.kind === 'initial' ? 0.55 : 1,
      }}
    >
      {mark.value}
    </span>
  )
  if (!badge) return glyph
  // ⭐ The circle is 1.7× the glyph so the mark sits IN it rather than filling it.
  const box = Math.round(size * 1.7)
  return (
    <div className={className} style={{ ...GLASS, width: box, height: box, display: 'flex',
      alignItems: 'center', justifyContent: 'center', flexShrink: 0, ...style }}>
      {glyph}
    </div>
  )
}
