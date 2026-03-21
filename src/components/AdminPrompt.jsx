import { useState, useRef, useEffect } from 'react'
import useGuardianStatus from '../hooks/useGuardianStatus'

export default function AdminPrompt() {
  const open = useGuardianStatus(s => s.adminPromptOpen)
  const error = useGuardianStatus(s => s.adminPromptError)
  const submit = useGuardianStatus(s => s.submitAdminPassphrase)
  const cancel = useGuardianStatus(s => s.cancelAdminPrompt)
  const [value, setValue] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (open) {
      setValue('')
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  if (!open) return null

  const handleSubmit = (e) => {
    e.preventDefault()
    submit(value.trim())
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <form
        onSubmit={handleSubmit}
        className="bg-neutral-900 border border-outline rounded-2xl p-6 w-[min(320px,calc(100vw-3rem))] space-y-4 font-mono"
      >
        <h2 className="text-on-surface text-body font-medium">Admin</h2>
        <input
          ref={inputRef}
          type="password"
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder="Passphrase"
          autoComplete="off"
          className="w-full bg-surface-container-high text-on-surface text-body rounded-lg px-3 py-2.5 border border-outline-variant focus:border-on-surface-subtle outline-none"
        />
        {error && (
          <p className="text-rose-400 text-body-sm">{error}</p>
        )}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={!value.trim()}
            className="flex-1 py-2.5 rounded-lg bg-on-surface text-surface text-body-sm font-medium hover:bg-on-surface/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={cancel}
            className="px-4 py-2.5 rounded-lg bg-surface-container-high text-on-surface-variant text-body-sm hover:bg-surface-container-highest transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
