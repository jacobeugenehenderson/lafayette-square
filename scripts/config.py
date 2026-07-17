"""
Shared configuration for the Cartograph data pipeline.

Single-scene per process. The DEFAULT scene (Lafayette Square) uses the
hardcoded geography below. A non-default scene selected via the
CARTOGRAPH_SCENE env var reads its geography from
cartograph/data/<scene>/geography.json — the same pre-bake extent/projection
SSOT the JS backend (cartograph/config.js) reads, so the Python and JS
fetchers agree. With CARTOGRAPH_SCENE unset, everything below is unchanged (LS)
and outputs still land in scripts/raw + src/data. When it IS set, RAW_DIR /
DATA_DIR redirect into the scene's own folder so LS is never clobbered.
"""
import os
import sys
import json

DEFAULT_SCENE = 'lafayette-square'
SCENE = os.environ.get('CARTOGRAPH_SCENE', DEFAULT_SCENE)

SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPTS_DIR)

# ── Geography: DEFAULT (Lafayette Square) ────────────────────────────────
# Lafayette Park center (actual park centroid from OSM)
CENTER_LAT = 38.6160
CENTER_LON = -90.2161

# Bounding box (N: Chouteau Ave, S: I-44, W: Jefferson Ave, E: Dolman St)
BBOX = {
    'min_lat': 38.6090,
    'max_lat': 38.6250,
    'min_lon': -90.2255,  # Original: reaches ~1 block west of Jefferson
    'max_lon': -90.2070,
}

# Conversion constants at this latitude
LON_TO_METERS = 86774
LAT_TO_METERS = 111000

# ── Non-default scene: load geography.json (camelCase → snake_case BBOX) ──
if SCENE != DEFAULT_SCENE:
    _geo_path = os.path.join(PROJECT_DIR, 'cartograph', 'data', SCENE, 'geography.json')
    if os.path.exists(_geo_path):
        with open(_geo_path) as _gf:
            _g = json.load(_gf)
        CENTER_LAT = _g['lat']
        CENTER_LON = _g['lon']
        LON_TO_METERS = _g['lonToMeters']
        LAT_TO_METERS = _g['latToMeters']
        _b = _g['bbox']
        BBOX = {
            'min_lat': _b['minLat'], 'max_lat': _b['maxLat'],
            'min_lon': _b['minLon'], 'max_lon': _b['maxLon'],
        }
    else:
        print(f"[config] CARTOGRAPH_SCENE={SCENE} but no {_geo_path}; "
              f"using LS geography", file=sys.stderr)

# Overture Maps release
OVERTURE_RELEASE = '2026-01-21.0'

# Directories (SCRIPTS_DIR / PROJECT_DIR defined above). Default scene keeps
# the legacy layout (scripts/raw + src/data); a non-default scene redirects
# into cartograph/data/<scene>/{raw,clean} so LS's live data is never touched.
if SCENE == DEFAULT_SCENE:
    DATA_DIR = os.path.join(PROJECT_DIR, 'src', 'data')
    RAW_DIR = os.path.join(SCRIPTS_DIR, 'raw')
else:
    DATA_DIR = os.path.join(PROJECT_DIR, 'cartograph', 'data', SCENE, 'clean')
    RAW_DIR = os.path.join(PROJECT_DIR, 'cartograph', 'data', SCENE, 'raw')

# Tree-intake outputs are ALWAYS scene-homed (cartograph/data/<scene>/{clean,raw}),
# even for the default scene. LS's tree pipeline was normalized off the legacy
# src/data layout 2026-07-16 (HANDOFF-ls-statistical-planting.md, Move 1). For a
# non-default scene these equal DATA_DIR/RAW_DIR above; only LS differs (its OTHER
# intake — parcels/osm/lamps/merge — deliberately stays on src/data).
SCENE_CLEAN_DIR = os.path.join(PROJECT_DIR, 'cartograph', 'data', SCENE, 'clean')
SCENE_RAW_DIR   = os.path.join(PROJECT_DIR, 'cartograph', 'data', SCENE, 'raw')

# Load .env file if present (for API keys)
_env_path = os.path.join(SCRIPTS_DIR, '.env')
if os.path.exists(_env_path):
    with open(_env_path) as _f:
        for _line in _f:
            _line = _line.strip()
            if _line and not _line.startswith('#') and '=' in _line:
                _key, _val = _line.split('=', 1)
                os.environ.setdefault(_key.strip(), _val.strip())

# API keys (from environment or .env file)
MAPILLARY_TOKEN = os.environ.get('MAPILLARY_ACCESS_TOKEN', '')

# Victorian brick palette
BUILDING_COLORS = [
    '#8B4513', '#A0522D', '#CD853F',
    '#8B2500', '#A52A2A', '#B22222',
    '#808080', '#696969', '#778899',
    '#DCDCDC', '#D2B48C', '#F5DEB3',
]


def wgs84_to_local(lon, lat):
    """Convert WGS84 to local meters centered on Lafayette Park."""
    x = (lon - CENTER_LON) * LON_TO_METERS
    z = (CENTER_LAT - lat) * LAT_TO_METERS  # Z = south (+)
    return x, z


def ensure_dirs():
    """Create output directories if needed."""
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(RAW_DIR, exist_ok=True)
    os.makedirs(SCENE_CLEAN_DIR, exist_ok=True)
    os.makedirs(SCENE_RAW_DIR, exist_ok=True)
