/**
 * Shared avatar renderer — emoji on vignette background with stroke.
 * Vignette is required for emoji avatars (auto-assigns Decorator if missing).
 */
import { getVignetteBackground } from '../lib/vignettePresets'

// Outer dimensions + emoji scale (emoji is ~60% of circle diameter for breathing room)
const SIZES = {
  5:  { box: 'w-5 h-5',   emoji: 'text-[10px]', letterSize: '8px' },
  7:  { box: 'w-7 h-7',   emoji: 'text-sm',      letterSize: '10px' },
  9:  { box: 'w-9 h-9',   emoji: 'text-lg',      letterSize: undefined },
  12: { box: 'w-12 h-12', emoji: 'text-2xl',     letterSize: undefined },
  16: { box: 'w-16 h-16', emoji: 'text-4xl',     letterSize: undefined },
}

const DEFAULT_VIGNETTE = 'v0'

export default function AvatarCircle({ emoji, vignette, size = 9, fallback, className = '' }) {
  const s = SIZES[size] || SIZES[9]
  const display = emoji || fallback || null

  // No emoji and no fallback → generic user icon
  if (!display) {
    return (
      <div className={`${s.box} rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0 ring-1 ring-white/15 ${className}`}>
        <svg className="w-1/2 h-1/2 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
        </svg>
      </div>
    )
  }

  // Letter fallback (no emoji) → gradient background
  const isEmoji = /[^\x00-\x7F]/.test(display)
  if (!isEmoji) {
    return (
      <div className={`${s.box} rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0 text-white font-medium ring-1 ring-white/15 ${className}`}
           style={{ fontSize: s.letterSize }}>
        {display}
      </div>
    )
  }

  // Emoji with vignette (required — default to Decorator if missing)
  const vid = vignette || DEFAULT_VIGNETTE
  const bg = getVignetteBackground(emoji, vid)

  return (
    <div
      className={`${s.box} ${s.emoji} rounded-full flex items-center justify-center flex-shrink-0 ring-1 ring-white/15 ${className}`}
      style={{ background: bg }}
    >
      {display}
    </div>
  )
}
