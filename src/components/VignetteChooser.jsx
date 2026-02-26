/**
 * Step 2 of avatar editor — pick a vignette style for the chosen emoji.
 * Shows large preview + row of 4 swatch circles (none + v0–v2).
 */
import { useMemo } from 'react'
import AvatarCircle from './AvatarCircle'
import { getVignetteSwatches } from '../lib/vignettePresets'

export default function VignetteChooser({ emoji, vignette, onVignetteChange, onBack, onSave }) {
  const swatches = useMemo(() => getVignetteSwatches(emoji), [emoji])

  return (
    <div className="flex flex-col items-center gap-5">
      {/* Large preview */}
      <AvatarCircle emoji={emoji} vignette={vignette} size={16} />

      {/* Swatch row */}
      <div className="flex items-center gap-3">
        {/* None option */}
        <button
          onClick={() => onVignetteChange(null)}
          className={`w-10 h-10 rounded-full border-2 transition-all duration-150 flex items-center justify-center text-lg ${
            !vignette
              ? 'border-white/70 scale-110'
              : 'border-white/20 hover:border-white/40'
          }`}
        >
          {emoji}
        </button>

        {/* Generated swatches */}
        {swatches.map(s => (
          <button
            key={s.id}
            onClick={() => onVignetteChange(s.id)}
            className={`w-10 h-10 rounded-full border-2 transition-all duration-150 ${
              vignette === s.id
                ? 'border-white/70 scale-110'
                : 'border-white/20 hover:border-white/40'
            }`}
            style={{ background: s.background }}
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
