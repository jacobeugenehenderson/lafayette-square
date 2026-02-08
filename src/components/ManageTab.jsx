import { useState, useMemo } from 'react'
import CATEGORIES from '../tokens/categories'
import { TAG_BY_ID, SUBCATEGORY_TAG_IDS, TAGS_BY_GROUP } from '../tokens/tags'
import { saveBusinessTags } from '../lib/api'
import { getDeviceHash } from '../lib/device'
import useBusinessData from '../hooks/useBusinessData'

/** Category display order for tag sections */
const CATEGORY_ORDER = ['dining', 'arts', 'shopping', 'services', 'historic', 'community', 'parks', 'residential']

function ManageTab({ businessId, initialPrimary, initialTags }) {
  const [selectedTags, setSelectedTags] = useState(() => new Set(initialTags || []))
  const [primaryTag, setPrimaryTag] = useState(initialPrimary || null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Track clean state for save button
  const isDirty = useMemo(() => {
    const initSet = new Set(initialTags || [])
    if (primaryTag !== (initialPrimary || null)) return true
    if (selectedTags.size !== initSet.size) return true
    for (const t of selectedTags) if (!initSet.has(t)) return true
    return false
  }, [selectedTags, primaryTag, initialPrimary, initialTags])

  const subcategoryTagsInSet = useMemo(
    () => [...selectedTags].filter(id => SUBCATEGORY_TAG_IDS.has(id)),
    [selectedTags]
  )

  function toggleTag(tagId) {
    setSaved(false)
    const tag = TAG_BY_ID[tagId]
    if (!tag) return

    if (selectedTags.has(tagId)) {
      // Prevent removing last subcategory tag
      if (tag.level === 'subcategory' && subcategoryTagsInSet.length <= 1) return
      const next = new Set(selectedTags)
      next.delete(tagId)
      setSelectedTags(next)
      // If removing the primary, auto-promote next subcategory
      if (tagId === primaryTag) {
        const remaining = [...next].filter(id => SUBCATEGORY_TAG_IDS.has(id))
        setPrimaryTag(remaining[0] || null)
      }
    } else {
      const next = new Set(selectedTags)
      next.add(tagId)
      setSelectedTags(next)
      // Auto-set primary if none
      if (!primaryTag && tag.level === 'subcategory') {
        setPrimaryTag(tagId)
      }
    }
  }

  function handlePrimaryChange(tagId) {
    setSaved(false)
    setPrimaryTag(tagId)
    // Ensure the tag is also selected
    if (!selectedTags.has(tagId)) {
      const next = new Set(selectedTags)
      next.add(tagId)
      setSelectedTags(next)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      const dh = await getDeviceHash()
      await saveBusinessTags(dh, businessId, primaryTag, [...selectedTags])
      useBusinessData.getState().applyTags(businessId, primaryTag, [...selectedTags])
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  const primaryCat = primaryTag ? TAG_BY_ID[primaryTag]?.group : null
  const primaryHex = primaryCat ? CATEGORIES[primaryCat]?.hex : null

  return (
    <div className="space-y-4 pb-14 relative">
      {/* Primary tag indicator */}
      <div className="rounded-lg bg-white/5 border border-white/10 p-3">
        <div className="text-[10px] text-white/40 uppercase tracking-wider mb-2">Primary Category</div>
        {subcategoryTagsInSet.length > 0 ? (
          <div className="flex items-center gap-2 flex-wrap">
            {subcategoryTagsInSet.map(tagId => {
              const tag = TAG_BY_ID[tagId]
              const catHex = tag?.group ? CATEGORIES[tag.group]?.hex : null
              const isActive = tagId === primaryTag
              return (
                <button
                  key={tagId}
                  onClick={() => handlePrimaryChange(tagId)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs transition-colors"
                  style={{
                    backgroundColor: isActive ? `${catHex}33` : 'rgba(255,255,255,0.05)',
                    color: isActive ? '#ffffffcc' : 'rgba(255,255,255,0.4)',
                    borderWidth: 1,
                    borderColor: isActive ? `${catHex}55` : 'rgba(255,255,255,0.1)',
                  }}
                >
                  {isActive && (
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  )}
                  {tag?.label}
                </button>
              )
            })}
          </div>
        ) : (
          <p className="text-white/30 text-xs">Select a subcategory tag below</p>
        )}
      </div>

      {/* Tag sections by category */}
      {CATEGORY_ORDER.map(catId => {
        const cat = CATEGORIES[catId]
        const tags = TAGS_BY_GROUP[catId]
        if (!cat || !tags) return null
        const subTags = tags.filter(t => t.level === 'subcategory')
        const featTags = tags.filter(t => t.level === 'feature')
        return (
          <details key={catId} className="group">
            <summary className="cursor-pointer flex items-center gap-2 text-sm font-medium text-white/70 hover:text-white/90 transition-colors">
              <svg className="w-3 h-3 transform group-open:rotate-90 transition-transform text-white/30" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.hex }} />
              {cat.label}
              <span className="text-[10px] text-white/30 ml-auto">
                {tags.filter(t => selectedTags.has(t.id)).length}/{tags.length}
              </span>
            </summary>
            <div className="mt-2 ml-5 space-y-2">
              {subTags.length > 0 && (
                <div>
                  <div className="text-[10px] text-white/30 uppercase tracking-wider mb-1">Subcategories</div>
                  <div className="flex flex-wrap gap-1.5">
                    {subTags.map(tag => (
                      <TagChip
                        key={tag.id}
                        tag={tag}
                        active={selectedTags.has(tag.id)}
                        isPrimary={tag.id === primaryTag}
                        hex={cat.hex}
                        onClick={() => toggleTag(tag.id)}
                      />
                    ))}
                  </div>
                </div>
              )}
              {featTags.length > 0 && (
                <div>
                  <div className="text-[10px] text-white/30 uppercase tracking-wider mb-1">Features</div>
                  <div className="flex flex-wrap gap-1.5">
                    {featTags.map(tag => (
                      <TagChip
                        key={tag.id}
                        tag={tag}
                        active={selectedTags.has(tag.id)}
                        isPrimary={false}
                        hex={cat.hex}
                        onClick={() => toggleTag(tag.id)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </details>
        )
      })}

      {/* Amenities section */}
      {TAGS_BY_GROUP.amenities && (
        <details className="group" open>
          <summary className="cursor-pointer flex items-center gap-2 text-sm font-medium text-white/70 hover:text-white/90 transition-colors">
            <svg className="w-3 h-3 transform group-open:rotate-90 transition-transform text-white/30" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
            Amenities
            <span className="text-[10px] text-white/30 ml-auto">
              {TAGS_BY_GROUP.amenities.filter(t => selectedTags.has(t.id)).length}/{TAGS_BY_GROUP.amenities.length}
            </span>
          </summary>
          <div className="mt-2 ml-5 flex flex-wrap gap-1.5">
            {TAGS_BY_GROUP.amenities.map(tag => (
              <TagChip
                key={tag.id}
                tag={tag}
                active={selectedTags.has(tag.id)}
                isPrimary={false}
                hex="#888888"
                onClick={() => toggleTag(tag.id)}
              />
            ))}
          </div>
        </details>
      )}

      {/* Sticky save button */}
      <div className="sticky bottom-0 pt-3 bg-gradient-to-t from-black/95 via-black/95 to-transparent">
        <button
          onClick={handleSave}
          disabled={!isDirty || saving}
          className="w-full py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          style={{
            backgroundColor: isDirty ? (primaryHex || '#ffffff') + '33' : 'rgba(255,255,255,0.05)',
            color: isDirty ? '#ffffffcc' : 'rgba(255,255,255,0.3)',
          }}
        >
          {saving ? 'Saving...' : saved ? 'Saved' : 'Save Tags'}
        </button>
      </div>
    </div>
  )
}

function TagChip({ tag, active, isPrimary, hex, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-colors"
      style={{
        backgroundColor: active ? `${hex}33` : 'rgba(255,255,255,0.05)',
        color: active ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.4)',
      }}
    >
      {isPrimary && (
        <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      )}
      {tag.label}
    </button>
  )
}

export default ManageTab
