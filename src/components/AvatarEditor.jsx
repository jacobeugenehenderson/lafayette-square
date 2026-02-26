/**
 * Two-step avatar editor modal.
 * Step 1: emoji-mart picker (dark theme, full categories + search)
 * Step 2: VignetteChooser (preview + swatch selection)
 */
import { useState, useEffect } from 'react'
import Picker from '@emoji-mart/react'
import data from '@emoji-mart/data'
import VignetteChooser from './VignetteChooser'

export default function AvatarEditor({ open, onClose, currentEmoji, currentVignette, onSave }) {
  const [step, setStep] = useState(1)       // 1 = emoji picker, 2 = vignette chooser
  const [emoji, setEmoji] = useState(null)
  const [vignette, setVignette] = useState(null)

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setStep(1)
      setEmoji(currentEmoji || null)
      setVignette(currentVignette || null)
    }
  }, [open, currentEmoji, currentVignette])

  if (!open) return null

  const handleEmojiSelect = (emojiData) => {
    setEmoji(emojiData.native)
    setStep(2)
  }

  const handleSave = () => {
    onSave(emoji, vignette)
    onClose()
  }

  const handleBackdrop = (e) => {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleBackdrop}
    >
      <div className="relative rounded-2xl bg-[#1a1a2e]/95 border border-white/15 shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-7 h-7 rounded-full bg-white/10 text-white/50 hover:text-white/80 hover:bg-white/15 flex items-center justify-center transition-colors"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        {step === 1 ? (
          <div className="p-1">
            <Picker
              data={data}
              onEmojiSelect={handleEmojiSelect}
              theme="dark"
              set="native"
              categories={['people', 'nature', 'foods', 'activity', 'objects', 'symbols']}
              perLine={8}
              emojiSize={28}
              emojiButtonSize={36}
              previewPosition="none"
              skinTonePosition="search"
              maxFrequentRows={2}
            />
          </div>
        ) : (
          <div className="p-6 min-w-[280px]">
            <h3 className="text-white/70 text-xs text-center mb-4 font-medium">Choose a style</h3>
            <VignetteChooser
              emoji={emoji}
              vignette={vignette}
              onVignetteChange={setVignette}
              onBack={() => setStep(1)}
              onSave={handleSave}
            />
          </div>
        )}
      </div>
    </div>
  )
}
