/**
 * CartographSurfaces — per-Look material editor, slotted into the existing
 * Stage Surfaces panel via StagePanel's `surfacesSlot` prop.
 *
 * Per the Looks model (project_cartograph_looks_model): each material is one
 * editable unit — color now, shader knobs in Pass C. Tabs group materials by
 * the same five-section structure the bake produces (Streets / Blocks /
 * Paths / Features / Labels), so the catalog lines up with what
 * cartograph-ground.svg can actually emit.
 *
 * Storage: every edit goes through the cartograph store's setters
 * (setLayerColor, setLuColor, toggleLayerVis, …) which autosave to the
 * active Look's design.json. No local-state mirror.
 */
import { useState } from 'react'
import useCartographStore from './stores/useCartographStore.js'
import { DEFAULT_LAYER_COLORS, DEFAULT_LU_COLORS } from './m3Colors.js'

// Defaults for non-bake material kinds (walls/roofs/neon/trees/park/infra).
// Mirrored from the standalone /stage SURFACE_CATALOG so identity matches
// between the two apps; cartograph adds per-Look overrides on top.
const DEFAULT_MATERIAL_COLORS = {
  // Walls
  brick_red: '#8B4513', brick_weathered: '#A0522D', stone: '#808080',
  stucco: '#D2B48C', wood_siding: '#CD853F',
  // Roofs
  roof_flat: '#2a2a2e', roof_metal: '#555560', roof_slate: '#3a3a42',
  // Building
  foundation: '#B8A88A', night_behavior: '#3d3530',
  // Neon (per-category sign tint)
  neon_dining: '#C2185B', neon_historic: '#D4A337', neon_arts: '#8E4585',
  neon_parks: '#3DAF8A', neon_shopping: '#C27F94', neon_services: '#3674A5',
  neon_community: '#B86B4A', neon_residential: '#7A8B6F',
  // Trees (leaf morphology tint)
  leaf_palmate: '#2d6828', leaf_lobed: '#2a5a22', leaf_compound: '#2e5e28',
  leaf_ovate_lg: '#2a5828', leaf_ovate_sm: '#3a7035', leaf_heart: '#358030',
  leaf_tulip: '#2e6028', leaf_fan: '#4a8a30', leaf_palm_cmpd: '#2a5825',
  leaf_long_ndl: '#1e4420', leaf_short_ndl: '#1a3e22', leaf_scale: '#2a5a32',
  leaf_narrow: '#3a7a30', leaf_fine_cmpd: '#3a7a2a',
  // Park (interior)
  park_grass: '#2d5a2d', park_path: '#cccccc',
  // Infra (atmosphere props)
  streetlamp: '#fff2e0', arch: '#c8c8d0', terrain: '#2a2a26',
}

// Tab catalog — keys match bake material/layer ids so the row binding is
// straightforward. `kind: 'layer'` reads/writes layerColors+layerVis;
// `kind: 'lu'` reads/writes luColors; `kind: 'material'` reads/writes
// materialColors (3D-scene props that never reach the SVG bake).
// Visibility toggle is shown for 'layer' kind only — that's where the
// bake honors `layerVis` to skip materials in the published SVG.
const TABS = [
  {
    key: 'streets',
    label: 'Streets',
    items: [
      { id: 'street',   label: 'Asphalt',        kind: 'layer' },
      { id: 'highway',  label: 'Highway',        kind: 'layer' },
      { id: 'stripe',   label: 'Center Stripes', kind: 'layer' },
      { id: 'edgeline', label: 'Edge Lines',     kind: 'layer' },
      { id: 'bikelane', label: 'Bike Lanes',     kind: 'layer' },
    ],
  },
  {
    key: 'blocks',
    label: 'Blocks',
    items: [
      { id: 'lot',           label: 'Block',         kind: 'layer' },
      { id: 'curb',          label: 'Curb',          kind: 'layer' },
      { id: 'sidewalk',      label: 'Sidewalk',      kind: 'layer' },
      { id: 'treelawn',      label: 'Treelawn',      kind: 'layer' },
      { id: 'building',      label: 'Buildings',     kind: 'layer' },
      { id: 'garden',        label: 'Gardens',       kind: 'layer' },
      { id: 'playground',    label: 'Playgrounds',   kind: 'layer' },
      { id: 'swimming_pool', label: 'Pools',         kind: 'layer' },
      { id: 'pitch',         label: 'Pitches',       kind: 'layer' },
      { id: 'sports_centre', label: 'Sports Ctrs',   kind: 'layer' },
      { id: 'wood',          label: 'Woods',         kind: 'layer' },
      { id: 'scrub',         label: 'Scrub',         kind: 'layer' },
      { id: 'tree_row',      label: 'Tree Rows',     kind: 'layer' },
    ],
  },
  {
    key: 'landuse',
    label: 'Land Use',
    items: [
      { id: 'residential',       label: 'Residential', kind: 'lu' },
      { id: 'commercial',        label: 'Commercial',  kind: 'lu' },
      { id: 'vacant',            label: 'Vacant',      kind: 'lu' },
      { id: 'vacant-commercial', label: 'Vacant Com.', kind: 'lu' },
      { id: 'parking',           label: 'Parking',     kind: 'lu' },
      { id: 'institutional',     label: 'Institutional', kind: 'lu' },
      { id: 'recreation',        label: 'Recreation',  kind: 'lu' },
      { id: 'industrial',        label: 'Industrial',  kind: 'lu' },
    ],
  },
  {
    key: 'paths',
    label: 'Paths',
    items: [
      { id: 'alley',    label: 'Alleys',     kind: 'layer' },
      { id: 'footway',  label: 'Footways',   kind: 'layer' },
      { id: 'cycleway', label: 'Cycleways',  kind: 'layer' },
      { id: 'steps',    label: 'Steps',      kind: 'layer' },
      { id: 'path',     label: 'Dirt Paths', kind: 'layer' },
    ],
  },
  {
    key: 'features',
    label: 'Features',
    items: [
      { id: 'park',           label: 'Park',            kind: 'layer' },
      { id: 'water',          label: 'Water',           kind: 'layer' },
      { id: 'tree',           label: 'Trees',           kind: 'layer' },
      { id: 'lamp',           label: 'Lamps',           kind: 'layer' },
      { id: 'fence',          label: 'Fences',          kind: 'layer' },
      { id: 'wall',           label: 'Walls',           kind: 'layer' },
      { id: 'retaining_wall', label: 'Retaining Walls', kind: 'layer' },
      { id: 'hedge',          label: 'Hedges',          kind: 'layer' },
    ],
  },
  {
    key: 'labels',
    label: 'Labels',
    items: [
      { id: 'labels', label: 'Labels', kind: 'layer' },
    ],
  },
  {
    key: 'walls',
    label: 'Walls',
    items: [
      { id: 'brick_red',       label: 'Brick Red',       kind: 'material' },
      { id: 'brick_weathered', label: 'Brick Weathered', kind: 'material' },
      { id: 'stone',           label: 'Stone',           kind: 'material' },
      { id: 'stucco',          label: 'Stucco',          kind: 'material' },
      { id: 'wood_siding',     label: 'Wood Siding',     kind: 'material' },
    ],
  },
  {
    key: 'roofs',
    label: 'Roofs',
    items: [
      { id: 'roof_flat',  label: 'Flat',  kind: 'material' },
      { id: 'roof_metal', label: 'Metal', kind: 'material' },
      { id: 'roof_slate', label: 'Slate', kind: 'material' },
    ],
  },
  {
    key: 'building',
    label: 'Building',
    items: [
      { id: 'foundation',     label: 'Foundation', kind: 'material' },
      { id: 'night_behavior', label: 'Night Shift', kind: 'material' },
    ],
  },
  {
    key: 'neon',
    label: 'Neon',
    items: [
      { id: 'neon_dining',      label: 'Dining',      kind: 'material' },
      { id: 'neon_historic',    label: 'Historic',    kind: 'material' },
      { id: 'neon_arts',        label: 'Arts',        kind: 'material' },
      { id: 'neon_parks',       label: 'Parks',       kind: 'material' },
      { id: 'neon_shopping',    label: 'Shopping',    kind: 'material' },
      { id: 'neon_services',    label: 'Services',    kind: 'material' },
      { id: 'neon_community',   label: 'Community',   kind: 'material' },
      { id: 'neon_residential', label: 'Residential', kind: 'material' },
    ],
  },
  {
    key: 'trees',
    label: 'Trees',
    items: [
      { id: 'leaf_palmate',    label: 'Palmate',     kind: 'material' },
      { id: 'leaf_lobed',      label: 'Lobed',       kind: 'material' },
      { id: 'leaf_compound',   label: 'Compound',    kind: 'material' },
      { id: 'leaf_ovate_lg',   label: 'Ovate Lg',    kind: 'material' },
      { id: 'leaf_ovate_sm',   label: 'Ovate Sm',    kind: 'material' },
      { id: 'leaf_heart',      label: 'Heart',       kind: 'material' },
      { id: 'leaf_tulip',      label: 'Tulip',       kind: 'material' },
      { id: 'leaf_fan',        label: 'Fan',         kind: 'material' },
      { id: 'leaf_palm_cmpd',  label: 'Palm Cmpd',   kind: 'material' },
      { id: 'leaf_long_ndl',   label: 'Long Needle', kind: 'material' },
      { id: 'leaf_short_ndl',  label: 'Short Needle', kind: 'material' },
      { id: 'leaf_scale',      label: 'Scale',       kind: 'material' },
      { id: 'leaf_narrow',     label: 'Narrow',      kind: 'material' },
      { id: 'leaf_fine_cmpd',  label: 'Fine Cmpd',   kind: 'material' },
    ],
  },
  {
    key: 'park',
    label: 'Park',
    items: [
      { id: 'park_grass', label: 'Grass', kind: 'material' },
      { id: 'park_path',  label: 'Paths', kind: 'material' },
    ],
  },
  {
    key: 'infra',
    label: 'Infra',
    items: [
      { id: 'streetlamp', label: 'Lamps', kind: 'material' },
      { id: 'arch',       label: 'Arch',  kind: 'material' },
      { id: 'terrain',    label: 'Ground', kind: 'material' },
    ],
  },
]

function colorFor(item, layerColors, luColors, materialColors) {
  if (item.kind === 'lu') return luColors[item.id] || DEFAULT_LU_COLORS[item.id] || '#888888'
  if (item.kind === 'material') return materialColors[item.id] || DEFAULT_MATERIAL_COLORS[item.id] || '#888888'
  return layerColors[item.id] || DEFAULT_LAYER_COLORS[item.id] || '#888888'
}

function Swatch({ item, color, visible, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 cursor-pointer group"
      style={{ width: 56 }}
      title={visible ? item.label : `${item.label} (hidden)`}
    >
      <div
        className="w-8 h-8 rounded-full border-2 transition-all shadow-sm"
        style={{
          backgroundColor: color,
          borderColor: selected ? 'var(--vic-gold)' : 'var(--outline-variant)',
          boxShadow: selected ? '0 0 0 2px var(--vic-gold)' : 'none',
          opacity: visible ? 1 : 0.35,
        }}
      />
      <span
        className="text-caption leading-tight text-center transition-colors"
        style={{
          color: selected ? 'var(--on-surface)' : 'var(--on-surface-subtle)',
          fontSize: 9,
          opacity: visible ? 1 : 0.6,
        }}
      >
        {item.label}
      </span>
    </button>
  )
}

export default function CartographSurfaces() {
  const [activeTab, setActiveTab] = useState('streets')
  const [selectedId, setSelectedId] = useState(null)

  const layerVis       = useCartographStore(s => s.layerVis)
  const layerColors    = useCartographStore(s => s.layerColors)
  const luColors       = useCartographStore(s => s.luColors)
  const materialColors = useCartographStore(s => s.materialColors)
  const activeLookId   = useCartographStore(s => s.activeLookId)
  const setLayerColor    = useCartographStore(s => s.setLayerColor)
  const setLuColor       = useCartographStore(s => s.setLuColor)
  const setMaterialColor = useCartographStore(s => s.setMaterialColor)
  const toggleLayerVis   = useCartographStore(s => s.toggleLayerVis)

  const tab = TABS.find(t => t.key === activeTab) || TABS[0]
  const selectedItem = selectedId ? tab.items.find(i => i.id === selectedId) : null

  const isVisible = (item) => {
    if (item.kind !== 'layer') return true       // visibility only on bake layers
    return layerVis[item.id] !== false           // unset = visible
  }
  const setColor = (item, color) => {
    if (item.kind === 'lu')       setLuColor(item.id, color)
    else if (item.kind === 'material') setMaterialColor(item.id, color)
    else                          setLayerColor(item.id, color)
  }
  const resetColor = (item) => {
    const def = item.kind === 'lu'       ? DEFAULT_LU_COLORS[item.id]
              : item.kind === 'material' ? DEFAULT_MATERIAL_COLORS[item.id]
              :                            DEFAULT_LAYER_COLORS[item.id]
    if (def) setColor(item, def)
  }

  return (
    <div className="space-y-2">
      <div className="section-heading">
        Surfaces · <span style={{ opacity: 0.6 }}>{activeLookId || '—'}</span>
      </div>

      {/* Tab bar */}
      <div className="flex flex-wrap gap-0.5">
        {TABS.map(t => (
          <button key={t.key}
            onClick={() => { setActiveTab(t.key); setSelectedId(null) }}
            className="px-1.5 py-0.5 rounded text-caption cursor-pointer transition-colors"
            style={{
              background: activeTab === t.key ? 'var(--surface-container-highest)' : 'transparent',
              color:      activeTab === t.key ? 'var(--on-surface)' : 'var(--on-surface-subtle)',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Swatch grid */}
      <div className="flex flex-wrap gap-1.5 py-1">
        {tab.items.map(item => (
          <Swatch
            key={item.id}
            item={item}
            color={colorFor(item, layerColors, luColors, materialColors)}
            visible={isVisible(item)}
            selected={selectedId === item.id}
            onClick={() => setSelectedId(selectedId === item.id ? null : item.id)}
          />
        ))}
      </div>

      {/* Selected material editor */}
      {selectedItem && (
        <div className="space-y-2 pt-1" style={{ borderTop: '1px solid var(--outline-variant)' }}>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full"
              style={{ backgroundColor: colorFor(selectedItem, layerColors, luColors, materialColors) }} />
            <span className="text-body-sm font-medium" style={{ color: 'var(--on-surface)' }}>
              {selectedItem.label}
            </span>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-caption" style={{ color: 'var(--on-surface-variant)', width: 60 }}>Color</span>
              <input type="color"
                value={colorFor(selectedItem, layerColors, luColors, materialColors)}
                onChange={e => setColor(selectedItem, e.target.value)}
                style={{ width: 28, height: 20, border: 'none', borderRadius: 4, cursor: 'pointer' }} />
              <span className="text-caption font-mono" style={{ color: 'var(--on-surface-subtle)' }}>
                {colorFor(selectedItem, layerColors, luColors, materialColors)}
              </span>
              <button
                onClick={() => resetColor(selectedItem)}
                className="text-caption px-1.5 py-0.5 rounded cursor-pointer transition-colors ml-auto"
                style={{ background: 'transparent', color: 'var(--on-surface-subtle)' }}
                title="Reset to default">↺</button>
            </div>

            {selectedItem.kind === 'layer' && (
              <div className="flex items-center gap-2">
                <span className="text-caption" style={{ color: 'var(--on-surface-variant)', width: 60 }}>Visible</span>
                <input type="checkbox"
                  checked={isVisible(selectedItem)}
                  onChange={() => toggleLayerVis(selectedItem.id)}
                  style={{ accentColor: 'var(--vic-gold)' }} />
                <span className="text-caption" style={{ color: 'var(--on-surface-subtle)' }}>
                  {isVisible(selectedItem) ? 'shown' : 'hidden in this Look'}
                </span>
              </div>
            )}

            {/* Shader controls — placeholder slots for Pass C: roughness,
                emissive, texture, animation. Wired through the same Look
                design.json once shader plumbing exists. */}
            <div className="text-caption" style={{ color: 'var(--on-surface-subtle)', fontStyle: 'italic', paddingTop: 4 }}>
              Shader controls (roughness, emissive, texture) — coming in Pass C.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
