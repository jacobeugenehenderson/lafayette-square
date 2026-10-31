/**
 * Role badge — the town's mark on a glass or colored vignette.
 *
 * Roles:
 *   "visitor"   — glass (anonymous, not yet signed in)
 *   "resident"  — burnt orange / brown / black
 *   "guardian"  — teal / aquamarine
 *
 * Shares the same size map as AvatarCircle for layout consistency.
 *
 * ⭐ The mark is the town's LOOK's (`identity.mark`, baked into its scene.json — the one the Ward wears and the
 * splash draws); a town whose Look has no mark draws its own INITIAL, and a scene not yet read draws nothing (as the
 * splash does: never a guess). ⛔ Never another town's mark,
 * and no drawn monument: the Gateway Arch was Lafayette Square's old-player mark and is gone (Jacob, 2026-10-31:
 * "There is no Arch because that departs from the kit convention").
 */
import { INSTANCE } from '../instance.js'
import { titleOf } from '../lib/townRecord.js'
import { initialOf } from '../lib/townIdentity.js'
import { useSceneJson } from '../lib/useSceneJson.js'
import { resolveLookId } from '../lib/resolveLookId.js'

const SIZES = {
  5:  { box: 'w-5 h-5',   glyph: 10, scale: 0.35 },
  7:  { box: 'w-7 h-7',   glyph: 15, scale: 0.5 },
  9:  { box: 'w-9 h-9',   glyph: 21, scale: 0.7 },
  12: { box: 'w-12 h-12', glyph: 28, scale: 0.85 },
  16: { box: 'w-16 h-16', glyph: 38, scale: 1.0 },
}

const THEMES = {
  visitor: {
    background: 'radial-gradient(circle at 40% 35%, rgba(255,255,255,0.1) 0%, transparent 100%)',
    boxShadow: 'inset 0 0.5px 1px rgba(255,255,255,0.15), inset 0 -1px 2px rgba(0,0,0,0.2)',
    borderColor: 'rgba(255,255,255,0.1)',
  },
  resident: {
    background: 'radial-gradient(circle at 40% 35%, hsl(25, 60%, 42%) 0%, hsl(18, 50%, 26%) 55%, hsl(12, 40%, 10%) 100%)',
    boxShadow: 'inset 0 0 0 1.5px hsla(30, 55%, 55%, 0.35), inset 0 -2px 6px hsla(12, 40%, 6%, 0.5)',
    borderColor: 'hsl(15, 35%, 18%)',
  },
  guardian: {
    background: 'radial-gradient(circle at 40% 35%, hsl(174, 50%, 42%) 0%, hsl(180, 45%, 26%) 55%, hsl(186, 40%, 10%) 100%)',
    boxShadow: 'inset 0 0 0 1.5px hsla(170, 50%, 55%, 0.35), inset 0 -2px 6px hsla(186, 40%, 6%, 0.5)',
    borderColor: 'hsl(180, 35%, 18%)',
  },
}

function scaleBoxShadow(shadow, factor) {
  if (factor === 1 || !shadow) return shadow
  return shadow.replace(/([\d.]+)px/g, (_, n) => {
    return Math.max(0.5, parseFloat(n) * factor).toFixed(1) + 'px'
  })
}

export default function RoleBadge({ role = 'resident', size = 9, className = '' }) {
  const s = SIZES[size] || SIZES[9]
  const theme = THEMES[role] || THEMES.resident
  const k = s.scale
  const scene = useSceneJson(resolveLookId())
  const mark = scene?.identity?.mark || null

  return (
    <div
      className={`${s.box} rounded-full flex items-center justify-center flex-shrink-0 ${className}`}
      style={{
        background: theme.background,
        boxShadow: scaleBoxShadow(theme.boxShadow, k),
        borderColor: theme.borderColor,
        borderWidth: `${Math.max(0.5, 1.5 * k).toFixed(1)}px`,
        borderStyle: 'solid',
      }}
    >
      {scene && <span style={{ fontSize: Math.round(s.glyph * (mark ? 0.82 : 0.62)), lineHeight: 1 }}>{mark || initialOf(titleOf(INSTANCE))}</span>}
    </div>
  )
}
