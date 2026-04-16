import useCartographStore from './stores/useCartographStore.js'

export default function StatusBar() {
  const status = useCartographStore(s => s.status)
  if (!status) return null

  return <div className="carto-status">{status}</div>
}
