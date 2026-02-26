/**
 * Step 2 of avatar editor — pick a vignette style for the chosen emoji.
 * Shows large preview + row of 3 swatch circles (v0–v2). No "none" option.
 */
import { useMemo, useState, useEffect } from 'react'
import AvatarCircle from './AvatarCircle'
import { getVignetteSwatches, warmUpEmojiColor } from '../lib/vignettePresets'

const LABELS = { v0: 'Decorator', v1: 'Vivid', v2: 'Complement' }

export default function VignetteChooser({ emoji, vignette, onVignetteChange, onBack, onSave }) {
  const [ready, setReady] = useState(false)
  const active = vignette || 'v0'

  // Warm up color extraction (async SVG render), then trigger re-render
  useEffect(() => {
    setReady(false)
    if (!emoji) return
    warmUpEmojiColor(emoji).then(() => setReady(true))
  }, [emoji])

  const swatches = useMemo(() => getVignetteSwatches(emoji), [emoji, ready])

  return (
    <div className="flex flex-col items-center gap-5">
      {/* Large preview */}
      <AvatarCircle emoji={emoji} vignette={active} size={16} />

      {/* Swatch row */}
      <div className="flex items-center gap-3">
        {swatches.map(s => (
          <button
            key={s.id}
            onClick={() => onVignetteChange(s.id)}
            className={`w-10 h-10 rounded-full ring-1 transition-all duration-150 ${
              active === s.id
                ? 'ring-white/70 scale-110'
                : 'ring-white/20 hover:ring-white/40'
            }`}
            style={{ background: s.background }}
            title={LABELS[s.id]}
          />
        ))}
      </div>

      {/* Actions */}
      <div className="flex flex-col items-center gap-2 w-full">
        <button
          onClick={onSave}
          className="w-full py-2.5 rounded-lg text-sm font-medium bg-white/15 text-white hover:bg-white/20 transition-colors"
        >
          Save
        </button>
        <button
          onClick={onBack}
          className="text-white/40 text-xs hover:text-white/60 transition-colors"
        >
          Change emoji
        </button>
      </div>
    </div>
  )
}
