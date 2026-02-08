"""
Shared configuration for Lafayette Square data pipeline.
"""
import os

# Lafayette Park center (actual park centroid from OSM)
CENTER_LAT = 38.6160
CENTER_LON = -90.2161

# Bounding box (N: Chouteau Ave, S: I-44, W: Jefferson Ave, E: Dolman St)
BBOX = {
    'min_lat': 38.6090,
    'max_lat': 38.6250,
    'min_lon': -90.2225,
    'max_lon': -90.2070,
}

# Conversion constants at this latitude
LON_TO_METERS = 86774
LAT_TO_METERS = 111000

# Overture Maps release
OVERTURE_RELEASE = '2026-01-21.0'

# Directories
SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPTS_DIR)
DATA_DIR = os.path.join(PROJECT_DIR, 'src', 'data')
RAW_DIR = os.path.join(SCRIPTS_DIR, 'raw')

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
