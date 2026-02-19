import { useState, useEffect, useRef, useCallback } from 'react'
import { create } from 'zustand'
import useCamera from '../hooks/useCamera'

export const useCodeDesk = create((set) => ({
  open: false,
  listingId: null,
  qrType: 'Townie',
  setOpen: (open, opts) => set({
    open,
    listingId: opts?.listingId || null,
    qrType: opts?.qrType || 'Townie',
  }),
}))

export default function CodeDeskModal() {
  const open = useCodeDesk((s) => s.open)
  const storeListingId = useCodeDesk((s) => s.listingId)
  const storeQrType = useCodeDesk((s) => s.qrType)
  const close = useCallback(() => useCodeDesk.getState().setOpen(false), [])
  const [qrType, setQrType] = useState('Townie')
  const iframeRef = useRef(null)

  // Sync local qrType from store when modal opens
  useEffect(() => {
    if (open) setQrType(storeQrType || 'Townie')
  }, [open, storeQrType])

  // Auto-collapse SidePanel when modal opens
  useEffect(() => {
    if (open) useCamera.getState().setPanelOpen(false)
  }, [open])

  // ESC to close
  useEffect(() => {
    if (!open) return
    const handleKey = (e) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, close])

  // Send type changes to iframe via postMessage
  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe || !open) return
    iframe.contentWindow?.postMessage({ type: 'lsq-set-qr-type', value: qrType }, '*')
  }, [qrType, open])

  // Also send type + listing on iframe load (initial sync)
  const handleIframeLoad = useCallback(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    iframe.contentWindow?.postMessage({ type: 'lsq-set-qr-type', value: qrType }, '*')
    if (storeListingId) {
      iframe.contentWindow?.postMessage({ type: 'lsq-set-listing', value: storeListingId }, '*')
    }
  }, [qrType, storeListingId])

  if (!open) return null

  return (
    <div
      className="absolute top-3 left-3 right-3 bg-black/40 backdrop-blur-2xl backdrop-saturate-150 rounded-2xl text-white shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-white/20 overflow-hidden flex flex-col z-50"
      style={{
        fontFamily: 'ui-monospace, monospace',
        bottom: 'calc(76px + 18px)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10 flex-shrink-0">
        <h2 className="text-sm font-medium text-white">QR Generator</h2>
        <div className="flex items-center gap-2">
          <select
            value={qrType}
            onChange={(e) => setQrType(e.target.value)}
            className="bg-white/10 text-white text-xs rounded-lg border border-white/20 px-2 py-1 outline-none hover:bg-white/15 transition-colors"
            style={{ fontFamily: 'ui-monospace, monospace' }}
          >
            <option value="Townie" className="bg-neutral-800 text-white">Townie</option>
            <option value="Guardian" className="bg-neutral-800 text-white">Guardian</option>
          </select>
          <button
            onClick={close}
            className="w-8 h-8 bg-black/50 hover:bg-black/70 backdrop-blur-sm rounded-full flex items-center justify-center transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Iframe */}
      <iframe
        ref={iframeRef}
        src="/codedesk/?embed"
        onLoad={handleIframeLoad}
        className="flex-1 min-h-0 w-full border-0"
        style={{ background: 'transparent' }}
        title="QR Generator"
        allow="clipboard-write"
      />
    </div>
  )
}
