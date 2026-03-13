/**
 * Safety Report — shared by requester (PlaceCard) and courier (CourierDashboard)
 *
 * Anyone who feels unsafe during a Courier service may end the service
 * immediately and report the concern. Safety reports are taken seriously
 * and may result in suspension or removal from the network.
 */

import { useState } from 'react'

// Either party can report — reasons cover both sides
const SAFETY_REASONS = [
  { id: 'violence', label: 'Violence' },
  { id: 'harassment', label: 'Harassment' },
  { id: 'unsafe_driving', label: 'Unsafe driving' },
  { id: 'fraud', label: 'Fraud / fare issue' },
  { id: 'refusing_to_leave', label: 'Refusing to leave vehicle' },
  { id: 'other', label: 'Other concern' },
]

export default function SafetyReport({ onReport, onCancel }) {
  const [reason, setReason] = useState(null)
  const [details, setDetails] = useState('')

  return (
    <div className="mt-4 space-y-3 text-left">
      <p className="text-body-sm text-on-surface font-medium">
        Report a safety concern
      </p>
      <p className="text-caption text-on-surface-subtle">
        This will end the service immediately. Your report will be reviewed.
      </p>
      <div className="space-y-1.5">
        {SAFETY_REASONS.map((r) => (
          <button
            key={r.id}
            onClick={() => setReason(r.id)}
            className={`w-full text-left px-3 py-2 rounded-lg border text-body-sm transition-colors ${
              reason === r.id
                ? 'border-rose-400/40 bg-rose-500/10 text-rose-300'
                : 'border-outline-variant text-on-surface-variant hover:border-on-surface-subtle'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>
      {reason && (
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="Short description (optional)"
          rows={2}
          className="w-full rounded-lg bg-surface-container border border-outline-variant px-3 py-2 text-body-sm text-on-surface placeholder:text-on-surface-disabled resize-none focus:outline-none focus:border-on-surface-subtle"
        />
      )}
      <div className="flex gap-2">
        <button
          onClick={() => reason && onReport(reason, details)}
          disabled={!reason}
          className="flex-1 py-2 rounded-lg bg-rose-500/20 border border-rose-400/40 text-rose-300 text-body-sm font-medium hover:bg-rose-500/30 transition-colors disabled:opacity-40"
        >
          End service &amp; report
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg text-body-sm text-on-surface-subtle hover:text-on-surface-variant transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
