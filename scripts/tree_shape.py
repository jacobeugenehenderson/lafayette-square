"""Shared species -> render-shape taxonomy for St. Louis Forestry data.

`shape` (broad / conifer / ornamental / columnar / weeping) is the field the
tree bake consumes: `arborist/bake-trees.js` maps it to a variant category
(SHAPE_TO_CATEGORY, default 'broadleaf'). The City Forestry `COMMON` name
vocabulary is shared across scenes (LS, HiPointe-DeMun, the next town), so the
mapping lives here once.

Canonical home going forward. `scripts/12-process-park-trees.py` still carries
its own inline copy (predates this module); fold it into this import once LS's
`cartograph/data/clean/map.json` is regenerated so 12-process can be re-run and
verified byte-identical. Until then, keep the two in sync by hand if edited.
"""

# Shape archetypes for rendering
SHAPE_MAP = {
    # Broad spreading deciduous
    'Maple, Sugar': 'broad', 'Maple, Silver': 'broad', 'Maple, Red': 'broad',
    "Maple, Red 'October Glory'": 'broad', 'Maple, Norway': 'broad',
    'Maple, Hedge': 'broad', 'Maple, Amur': 'broad',
    'Oak, Pin': 'broad', 'oak, northern red': 'broad', 'oak, bur': 'broad',
    'Oak, English': 'broad', 'Oak, Swamp White': 'broad', 'Oak, White': 'broad',
    'oak, shingle': 'broad', 'Oak, Sawtooth': 'broad', 'Oak, Willow': 'broad',
    'oak, water': 'broad',
    'Ash, Green': 'broad', 'Ash, Blue': 'broad',
    'sycamore, American': 'broad', 'Sweetgum (undesirable)': 'broad',
    'Sweetgum': 'broad',
    'Tuliptree': 'broad', 'Hackberry': 'broad', 'Walnut, Black': 'broad',
    'Linden, American': 'broad', 'Linden, Littleleaf': 'broad',
    'Cottonwood, Eastern': 'broad', 'Catalpa, Southern': 'broad',
    'Elm, American': 'broad', 'Elm, American (undesirable)': 'broad',
    'Elm, Siberian': 'broad', 'Birch': 'broad',
    'Buckeye, Ohio': 'broad', 'locust, black': 'broad',
    'honeylocust, thornless': 'broad', 'Honeylocust': 'broad',
    'Blackgum': 'broad', 'mulberry, red': 'broad', 'pecan': 'broad',
    'persimmon, common': 'broad', 'Amur corktree': 'broad',
    'Zelkova, Japanese': 'broad', 'Tree of Heaven': 'broad',
    'royal paulownia': 'broad', 'Coffeetree, Kentucky': 'broad',
    'Chestnut, Chinese': 'broad',

    # Conifers
    'Pine, Austrian': 'conifer', 'Pine, White': 'conifer',
    'Pine, Scotch': 'conifer', 'pine, loblolly': 'conifer',
    'Spruce, Colorado': 'conifer', 'Spruce, Norway': 'conifer',
    'juniper, Chinese': 'conifer', 'redcedar, eastern': 'conifer',
    'Holly, American': 'conifer',

    # Small ornamental
    'Crabapple, Flowering': 'ornamental', 'Redbud': 'ornamental',
    'Dogwood, Flowering': 'ornamental', 'Dogwood, Kousa': 'ornamental',
    'Dogwood, Cornelian-cherry': 'ornamental', 'Pagoda Dogwood': 'ornamental',
    'serviceberry, downy': 'ornamental', "Serviceberry 'Autumn Brilliance'": 'ornamental',
    'downy serviceberry': 'ornamental',
    'Cherry, Japanese Flowering': 'ornamental', 'Cherry, Yoshino': 'ornamental',
    'hawthorn, Washington': 'ornamental', 'Pear, Callery': 'ornamental',
    'magnolia, saucer': 'ornamental', 'magnolia, star': 'ornamental',
    'maple, Japanese': 'ornamental', 'goldenraintree': 'ornamental',
    'plum, cherry': 'ornamental', 'possumhaw': 'ornamental',
    'smoketree, American': 'ornamental', 'lilac, Japanese tree': 'ornamental',
    'filbert, American': 'ornamental', 'Witch-hazel': 'ornamental',

    # Columnar / distinctive
    'Cypress, Bald': 'columnar', 'Ginkgo': 'columnar',

    # Weeping
    'Willow, Weeping': 'weeping', 'willow, corkscrew': 'weeping',
}


def get_shape(common_name):
    """Get rendering shape for a species, with fuzzy fallback."""
    if common_name in SHAPE_MAP:
        return SHAPE_MAP[common_name]
    # Fuzzy match
    lower = common_name.lower()
    if 'oak' in lower: return 'broad'
    if 'maple' in lower: return 'broad'
    if 'elm' in lower: return 'broad'
    if 'pine' in lower or 'spruce' in lower or 'cedar' in lower: return 'conifer'
    if 'juniper' in lower: return 'conifer'
    if any(w in lower for w in ['dogwood', 'cherry', 'crab', 'redbud',
                                 'serviceberry', 'hawthorn', 'magnolia']): return 'ornamental'
    if 'cypress' in lower: return 'columnar'
    if 'willow' in lower: return 'weeping'
    return 'broad'  # default
