/**
 * Role badge — Arch silhouette on a glass or colored vignette.
 *
 * Roles:
 *   "visitor"   — glass (anonymous, not yet signed in)
 *   "resident"  — burnt orange / brown / black
 *   "guardian"  — teal / aquamarine
 *
 * Shares the same size map as AvatarCircle for layout consistency.
 */

const SIZES = {
  5:  { box: 'w-5 h-5',   arch: 10, scale: 0.35 },
  7:  { box: 'w-7 h-7',   arch: 15, scale: 0.5 },
  9:  { box: 'w-9 h-9',   arch: 21, scale: 0.7 },
  12: { box: 'w-12 h-12', arch: 28, scale: 0.85 },
  16: { box: 'w-16 h-16', arch: 38, scale: 1.0 },
}

const THEMES = {
  visitor: {
    background: 'radial-gradient(circle at 40% 35%, rgba(255,255,255,0.1) 0%, transparent 100%)',
    boxShadow: 'inset 0 0.5px 1px rgba(255,255,255,0.15), inset 0 -1px 2px rgba(0,0,0,0.2)',
    borderColor: 'rgba(255,255,255,0.1)',
    archFill: 'rgba(255,255,255,0.9)',
    archDark: 'rgba(0,0,0,0.35)',
  },
  resident: {
    background: 'radial-gradient(circle at 40% 35%, hsl(25, 60%, 42%) 0%, hsl(18, 50%, 26%) 55%, hsl(12, 40%, 10%) 100%)',
    boxShadow: 'inset 0 0 0 1.5px hsla(30, 55%, 55%, 0.35), inset 0 -2px 6px hsla(12, 40%, 6%, 0.5)',
    borderColor: 'hsl(15, 35%, 18%)',
    archFill: 'hsl(30, 65%, 62%)',
    archDark: 'hsl(12, 40%, 12%)',
  },
  guardian: {
    background: 'radial-gradient(circle at 40% 35%, hsl(174, 50%, 42%) 0%, hsl(180, 45%, 26%) 55%, hsl(186, 40%, 10%) 100%)',
    boxShadow: 'inset 0 0 0 1.5px hsla(170, 50%, 55%, 0.35), inset 0 -2px 6px hsla(186, 40%, 6%, 0.5)',
    borderColor: 'hsl(180, 35%, 18%)',
    archFill: 'hsl(170, 55%, 60%)',
    archDark: 'hsl(186, 40%, 12%)',
  },
}

function scaleBoxShadow(shadow, factor) {
  if (factor === 1 || !shadow) return shadow
  return shadow.replace(/([\d.]+)px/g, (_, n) => {
    return Math.max(0.5, parseFloat(n) * factor).toFixed(1) + 'px'
  })
}

/**
 * Gateway Arch — from the favicon. Left leg has a dark body with bright
 * outline, right leg is solid filled. Matches the LS loading screen mark.
 */
function ArchSvg({ size, fill, dark }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 332 328"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ marginTop: '-8%' }}
    >
      {/* Left leg — dark body with bright outline */}
      <path
        d="M166.2,6.5c-119.8,0-138.5,206.7-159.4,314.7h24.2c13.5-71.4,24.9-307.3,135.2-307.3"
        stroke={dark}
        strokeWidth={14}
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M166.2,6.5c-119.8,0-138.5,206.7-159.4,314.7h24.2c13.5-71.4,24.9-307.3,135.2-307.3"
        stroke={fill}
        strokeWidth={6}
        strokeLinecap="round"
        fill="none"
      />
      {/* Right leg — solid fill */}
      <path
        d="M74.4,67.5c18.1-32.4,58.3-53.8,91.9-53.8,110.3,0,121.7,235.9,135.2,307.3h24.3C304.7,213.1,286.1,6.3,166.2,6.3c-41.2,0-70.4,24.8-91.9,61.2Z"
        fill={fill}
      />
    </svg>
  )
}

export default function RoleBadge({ role = 'resident', size = 9, className = '' }) {
  const s = SIZES[size] || SIZES[9]
  const theme = THEMES[role] || THEMES.resident
  const k = s.scale

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
      <ArchSvg size={s.arch} fill={theme.archFill} dark={theme.archDark} />
    </div>
  )
}
