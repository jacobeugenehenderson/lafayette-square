/**
 * The town's mark, drawn: `mark` is handed in — the town's own Look's (`identity.mark`, baked into its scene.json),
 * never read here from the page's boot instance. Two kinds: `emoji` (authored) and `initial` (a town that has authored
 * nothing — it must LOOK unauthored; there is no case that borrows someone else's mark). `markStyle` draws it as the
 * Ward's ◉ does (`townIdentity.js#MARK_STYLE_FILTER`).
 * REMOVED 2026-10-07: reading `townMark()` (INSTANCE.branding, the OLD LS player's record) and its drawn-arch branch —
 * the splash drew Lafayette Square's arch for HPDM, and for LS itself, whose Ward mark is ⚜️.
 */
import React from 'react'
import { MARK_STYLE_FILTER } from '../lib/townIdentity.js'

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

/** @param {{ mark: {kind:'emoji'|'initial', value:string}, markStyle?: string, size?: number, badge?: boolean }} props */
export default function TownMarkGlyph({ mark, markStyle, size = 32, style, className = '', badge = false }) {
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
        filter: mark.kind === 'emoji' ? (MARK_STYLE_FILTER[markStyle] ?? 'none') : 'none',
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
