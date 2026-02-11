import { useEffect, useState } from 'react'
import useSelectedBuilding from '../hooks/useSelectedBuilding'
import useCamera from '../hooks/useCamera'
import useBusinessData from '../hooks/useBusinessData'
import buildingsData from '../data/buildings.json'
import BusinessCard from './BusinessCard'

const INSTRUCTIONS = {
  hero: '',
  map: 'Scroll to zoom \u00B7 Drag to pan \u00B7 Double-click street for street view',
  society: 'Scroll to zoom \u00B7 Drag to pan or rotate \u00B7 Double-click street for street view',
  street: 'Drag to look around \u00B7 ESC to exit',
}

function Controls() {
  const selectedId = useSelectedBuilding((state) => state.selectedId)
  const selectedLandmarkId = useSelectedBuilding((state) => state.selectedLandmarkId)
  const showCard = useSelectedBuilding((state) => state.showCard)
  const deselect = useSelectedBuilding((state) => state.deselect)
  const viewMode = useCamera((state) => state.viewMode)
  const [buildingInfo, setBuildingInfo] = useState(null)
  const getById = useBusinessData((s) => s.getById)
  const getByBuildingId = useBusinessData((s) => s.getByBuildingId)

  useEffect(() => {
    if (selectedId) {
      const building = buildingsData.buildings.find((b) => b.id === selectedId)
      if (building) {
        setBuildingInfo(building)
      }
    } else {
      setBuildingInfo(null)
    }
  }, [selectedId])

  const landmark = selectedId
    ? (selectedLandmarkId ? getById(selectedLandmarkId) : getByBuildingId(selectedId))
    : null

  const text = INSTRUCTIONS[viewMode] || ''

  return (
    <>
      {text && (
        <div className="absolute bottom-4 right-4 text-gray-500 text-sm text-right z-50">
          <p>{text}</p>
        </div>
      )}

      {showCard && selectedId && buildingInfo && (
        <BusinessCard
          landmark={landmark}
          building={buildingInfo}
          onClose={deselect}
        />
      )}
    </>
  )
}

export default Controls
