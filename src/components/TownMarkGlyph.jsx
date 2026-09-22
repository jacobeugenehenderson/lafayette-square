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

export default function TownMarkGlyph({ size = 32, style, className = '' }) {
  const mark = townMark()
  if (mark.kind === 'svg') {
    // Today the only authored SVG mark is LS's arch, which RoleBadge already draws.
    return <RoleBadge role="visitor" size={Math.round(size / 4)} className={className} />
  }
  return (
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
        ...style,
      }}
    >
      {mark.value}
    </span>
  )
}
