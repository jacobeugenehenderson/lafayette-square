/**
 * Shared avatar renderer — emoji on optional vignette background.
 * Replaces all inline avatar rendering across the app.
 */
import { getVignetteBackground } from '../lib/vignettePresets'

const SIZE_CLASSES = {
  5:  'w-5 h-5 text-xs',
  7:  'w-7 h-7 text-lg',
  9:  'w-9 h-9 text-xl',
  12: 'w-12 h-12 text-3xl',
  16: 'w-16 h-16 text-5xl',
}

export default function AvatarCircle({ emoji, vignette, size = 9, fallback, className = '' }) {
  const sc = SIZE_CLASSES[size] || SIZE_CLASSES[9]
  const display = emoji || fallback || null

  // No emoji and no fallback → generic user icon
  if (!display) {
    return (
      <div className={`${sc} rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0 ${className}`}>
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
      <div className={`${sc} rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0 text-white font-medium ${className}`}
           style={{ fontSize: size <= 7 ? '10px' : undefined }}>
        {display}
      </div>
    )
  }

  // Emoji with optional vignette
  const bg = vignette ? getVignetteBackground(emoji, vignette) : 'none'
  const hasVignette = vignette && bg !== 'none'

  return (
    <div
      className={`${sc} rounded-full flex items-center justify-center flex-shrink-0 ${className}`}
      style={hasVignette ? { background: bg } : undefined}
    >
      {display}
    </div>
  )
}
