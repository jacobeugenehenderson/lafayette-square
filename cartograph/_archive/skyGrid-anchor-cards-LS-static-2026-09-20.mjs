// RETIRED 2026-09-20 — the static anchor-card table that shipped from 2026-05-20 until
// site 6 replaced it with per-town derivation (buildAnchorCards). Generated ONCE at
// Lafayette Square's 38.6160 / -90.2161 / UTC-6 and shipped to every town.
//
// ⛔ THIS FILE IS AN ORACLE, NOT LIVE CODE. checks/claims-sky-follows-its-town.mjs reads
// it to prove that deriving at LS's coordinates still reproduces LS's sky byte for byte.
// ⛔ NEVER 'update' it to match new output — its whole value is that it predates the
// change. If it stops matching, the sky MOVED, which is the thing the check exists to say.

export const ANCHOR_CARDS_PROCEDURAL = {
  winter: [
    { horizon: '#191722', low: '#101116', mid: '#090a0f', high: '#050607', sunGlow: '#000000' },  // 00:00
    { horizon: '#191722', low: '#101116', mid: '#090a0f', high: '#050607', sunGlow: '#000000' },  // 01:00
    { horizon: '#191722', low: '#101116', mid: '#090a0f', high: '#050607', sunGlow: '#000000' },  // 02:00
    { horizon: '#191722', low: '#101116', mid: '#090a0f', high: '#050607', sunGlow: '#000000' },  // 03:00
    { horizon: '#191722', low: '#101116', mid: '#090a0f', high: '#050607', sunGlow: '#000000' },  // 04:00
    { horizon: '#191722', low: '#101116', mid: '#090a0f', high: '#050607', sunGlow: '#000000' },  // 05:00
    { horizon: '#191722', low: '#101116', mid: '#090a0f', high: '#050607', sunGlow: '#000000' },  // 06:00
    { horizon: '#2a222e', low: '#222032', mid: '#141725', high: '#0a0c11', sunGlow: '#5b231a' },  // 07:00
    { horizon: '#cb9a7b', low: '#a2868f', mid: '#737ba8', high: '#344b69', sunGlow: '#ffc386' },  // 08:00
    { horizon: '#b6b2a3', low: '#96a2ad', mid: '#79a0bd', high: '#5589af', sunGlow: '#ffe6cc' },  // 09:00
    { horizon: '#a0c3d0', low: '#8bbad0', mid: '#6facd0', high: '#64a5d0', sunGlow: '#ffeedd' },  // 10:00
    { horizon: '#a0c3d0', low: '#8bbad0', mid: '#6facd0', high: '#64a5d0', sunGlow: '#ffeedd' },  // 11:00
    { horizon: '#a0c3d0', low: '#8bbad0', mid: '#6facd0', high: '#64a5d0', sunGlow: '#ffeedd' },  // 12:00
    { horizon: '#a0c3d0', low: '#8bbad0', mid: '#6facd0', high: '#64a5d0', sunGlow: '#ffeedd' },  // 13:00
    { horizon: '#a0c3d0', low: '#8bbad0', mid: '#6facd0', high: '#64a5d0', sunGlow: '#ffeedd' },  // 14:00
    { horizon: '#b5a895', low: '#98979c', mid: '#759db8', high: '#5386ac', sunGlow: '#ffe2c4' },  // 15:00
    { horizon: '#cb8662', low: '#ab7574', mid: '#696c9a', high: '#2c405f', sunGlow: '#ffb367' },  // 16:00
    { horizon: '#4a2a2d', low: '#281e2a', mid: '#121322', high: '#090c10', sunGlow: '#5a1a0c' },  // 17:00
    { horizon: '#191722', low: '#101116', mid: '#090a0f', high: '#050607', sunGlow: '#000000' },  // 18:00
    { horizon: '#191722', low: '#101116', mid: '#090a0f', high: '#050607', sunGlow: '#000000' },  // 19:00
    { horizon: '#191722', low: '#101116', mid: '#090a0f', high: '#050607', sunGlow: '#000000' },  // 20:00
    { horizon: '#191722', low: '#101116', mid: '#090a0f', high: '#050607', sunGlow: '#000000' },  // 21:00
    { horizon: '#191722', low: '#101116', mid: '#090a0f', high: '#050607', sunGlow: '#000000' },  // 22:00
    { horizon: '#191722', low: '#101116', mid: '#090a0f', high: '#050607', sunGlow: '#000000' },  // 23:00
  ],
  spring: [
    { horizon: '#1c1626', low: '#101018', mid: '#090910', high: '#050508', sunGlow: '#000000' },  // 00:00
    { horizon: '#1c1626', low: '#101018', mid: '#090910', high: '#050508', sunGlow: '#000000' },  // 01:00
    { horizon: '#1c1626', low: '#101018', mid: '#090910', high: '#050508', sunGlow: '#000000' },  // 02:00
    { horizon: '#1c1626', low: '#101018', mid: '#090910', high: '#050508', sunGlow: '#000000' },  // 03:00
    { horizon: '#1c1626', low: '#101018', mid: '#090910', high: '#050508', sunGlow: '#000000' },  // 04:00
    { horizon: '#1c1626', low: '#101018', mid: '#090910', high: '#050508', sunGlow: '#000000' },  // 05:00
    { horizon: '#372836', low: '#302545', mid: '#151534', high: '#0a0b19', sunGlow: '#9d4532' },  // 06:00
    { horizon: '#d8bc83', low: '#ae999f', mid: '#7d87be', high: '#385393', sunGlow: '#ffd0a2' },  // 07:00
    { horizon: '#a4c5e4', low: '#87b3e4', mid: '#6398e4', high: '#538be4', sunGlow: '#ffeedd' },  // 08:00
    { horizon: '#a4c5e4', low: '#87b3e4', mid: '#6398e4', high: '#538be4', sunGlow: '#ffeedd' },  // 09:00
    { horizon: '#a4c5e4', low: '#87b3e4', mid: '#6398e4', high: '#538be4', sunGlow: '#ffeedd' },  // 10:00
    { horizon: '#a4c5e4', low: '#87b3e4', mid: '#6398e4', high: '#538be4', sunGlow: '#ffeedd' },  // 11:00
    { horizon: '#a4c5e4', low: '#87b3e4', mid: '#6398e4', high: '#538be4', sunGlow: '#ffeedd' },  // 12:00
    { horizon: '#a4c5e4', low: '#87b3e4', mid: '#6398e4', high: '#538be4', sunGlow: '#ffeedd' },  // 13:00
    { horizon: '#a4c5e4', low: '#87b3e4', mid: '#6398e4', high: '#538be4', sunGlow: '#ffeedd' },  // 14:00
    { horizon: '#a4c5e4', low: '#87b3e4', mid: '#6398e4', high: '#538be4', sunGlow: '#ffeedd' },  // 15:00
    { horizon: '#a4c5e4', low: '#87b3e4', mid: '#6398e4', high: '#538be4', sunGlow: '#ffeedd' },  // 16:00
    { horizon: '#ccb881', low: '#a99a94', mid: '#7490c2', high: '#4368b0', sunGlow: '#ffd9b3' },  // 17:00
    { horizon: '#cf7339', low: '#a25557', mid: '#513971', high: '#161736', sunGlow: '#ff8a3f' },  // 18:00
    { horizon: '#1c1626', low: '#101018', mid: '#090910', high: '#050508', sunGlow: '#000000' },  // 19:00
    { horizon: '#1c1626', low: '#101018', mid: '#090910', high: '#050508', sunGlow: '#000000' },  // 20:00
    { horizon: '#1c1626', low: '#101018', mid: '#090910', high: '#050508', sunGlow: '#000000' },  // 21:00
    { horizon: '#1c1626', low: '#101018', mid: '#090910', high: '#050508', sunGlow: '#000000' },  // 22:00
    { horizon: '#1c1626', low: '#101018', mid: '#090910', high: '#050508', sunGlow: '#000000' },  // 23:00
  ],
  summer: [
    { horizon: '#1a1525', low: '#0f0f18', mid: '#080810', high: '#050508', sunGlow: '#000000' },  // 00:00
    { horizon: '#1a1525', low: '#0f0f18', mid: '#080810', high: '#050508', sunGlow: '#000000' },  // 01:00
    { horizon: '#1a1525', low: '#0f0f18', mid: '#080810', high: '#050508', sunGlow: '#000000' },  // 02:00
    { horizon: '#1a1525', low: '#0f0f18', mid: '#080810', high: '#050508', sunGlow: '#000000' },  // 03:00
    { horizon: '#1b1525', low: '#100f19', mid: '#080811', high: '#050508', sunGlow: '#000000' },  // 04:00
    { horizon: '#ce875a', low: '#9b6a80', mid: '#5c4f93', high: '#1b244b', sunGlow: '#faa56c' },  // 05:00
    { horizon: '#c8ba97', low: '#a1a3b1', mid: '#7396c5', high: '#3d70b3', sunGlow: '#ffe0c2' },  // 06:00
    { horizon: '#9dc5e0', low: '#80b5e0', mid: '#5a9ce0', high: '#4a90e0', sunGlow: '#ffeedd' },  // 07:00
    { horizon: '#9dc5e0', low: '#80b5e0', mid: '#5a9ce0', high: '#4a90e0', sunGlow: '#ffeedd' },  // 08:00
    { horizon: '#9dc5e0', low: '#80b5e0', mid: '#5a9ce0', high: '#4a90e0', sunGlow: '#ffeedd' },  // 09:00
    { horizon: '#9dc5e0', low: '#80b5e0', mid: '#5a9ce0', high: '#4a90e0', sunGlow: '#ffeedd' },  // 10:00
    { horizon: '#9dc5e0', low: '#80b5e0', mid: '#5a9ce0', high: '#4a90e0', sunGlow: '#ffeedd' },  // 11:00
    { horizon: '#9dc5e0', low: '#80b5e0', mid: '#5a9ce0', high: '#4a90e0', sunGlow: '#ffeedd' },  // 12:00
    { horizon: '#9dc5e0', low: '#80b5e0', mid: '#5a9ce0', high: '#4a90e0', sunGlow: '#ffeedd' },  // 13:00
    { horizon: '#9dc5e0', low: '#80b5e0', mid: '#5a9ce0', high: '#4a90e0', sunGlow: '#ffeedd' },  // 14:00
    { horizon: '#9dc5e0', low: '#80b5e0', mid: '#5a9ce0', high: '#4a90e0', sunGlow: '#ffeedd' },  // 15:00
    { horizon: '#9dc5e0', low: '#80b5e0', mid: '#5a9ce0', high: '#4a90e0', sunGlow: '#ffeedd' },  // 16:00
    { horizon: '#9dc5e0', low: '#80b5e0', mid: '#5a9ce0', high: '#4a90e0', sunGlow: '#ffeedd' },  // 17:00
    { horizon: '#bdb293', low: '#9d9ca3', mid: '#6994c7', high: '#3f74b9', sunGlow: '#ffe2c5' },  // 18:00
    { horizon: '#da813d', low: '#b76b63', mid: '#635298', high: '#192350', sunGlow: '#ffa552' },  // 19:00
    { horizon: '#2b1b26', low: '#18131e', mid: '#0b0a17', high: '#06060b', sunGlow: '#000000' },  // 20:00
    { horizon: '#1a1525', low: '#0f0f18', mid: '#080810', high: '#050508', sunGlow: '#000000' },  // 21:00
    { horizon: '#1a1525', low: '#0f0f18', mid: '#080810', high: '#050508', sunGlow: '#000000' },  // 22:00
    { horizon: '#1a1525', low: '#0f0f18', mid: '#080810', high: '#050508', sunGlow: '#000000' },  // 23:00
  ],
  autumn: [
    { horizon: '#151224', low: '#0d0e17', mid: '#060710', high: '#040508', sunGlow: '#000000' },  // 00:00
    { horizon: '#151224', low: '#0d0e17', mid: '#060710', high: '#040508', sunGlow: '#000000' },  // 01:00
    { horizon: '#151224', low: '#0d0e17', mid: '#060710', high: '#040508', sunGlow: '#000000' },  // 02:00
    { horizon: '#151224', low: '#0d0e17', mid: '#060710', high: '#040508', sunGlow: '#000000' },  // 03:00
    { horizon: '#151224', low: '#0d0e17', mid: '#060710', high: '#040508', sunGlow: '#000000' },  // 04:00
    { horizon: '#151224', low: '#0d0e17', mid: '#060710', high: '#040508', sunGlow: '#000000' },  // 05:00
    { horizon: '#ac4d3a', low: '#7a4572', mid: '#33296d', high: '#0c1533', sunGlow: '#f38c5f' },  // 06:00
    { horizon: '#c6a87d', low: '#9f9ba6', mid: '#6692bc', high: '#266aa8', sunGlow: '#ffddbc' },  // 07:00
    { horizon: '#8dc2d9', low: '#6bb3d9', mid: '#409bd9', high: '#2e8fd9', sunGlow: '#ffeedd' },  // 08:00
    { horizon: '#8dc2d9', low: '#6bb3d9', mid: '#409bd9', high: '#2e8fd9', sunGlow: '#ffeedd' },  // 09:00
    { horizon: '#8dc2d9', low: '#6bb3d9', mid: '#409bd9', high: '#2e8fd9', sunGlow: '#ffeedd' },  // 10:00
    { horizon: '#8dc2d9', low: '#6bb3d9', mid: '#409bd9', high: '#2e8fd9', sunGlow: '#ffeedd' },  // 11:00
    { horizon: '#8dc2d9', low: '#6bb3d9', mid: '#409bd9', high: '#2e8fd9', sunGlow: '#ffeedd' },  // 12:00
    { horizon: '#8dc2d9', low: '#6bb3d9', mid: '#409bd9', high: '#2e8fd9', sunGlow: '#ffeedd' },  // 13:00
    { horizon: '#8dc2d9', low: '#6bb3d9', mid: '#409bd9', high: '#2e8fd9', sunGlow: '#ffeedd' },  // 14:00
    { horizon: '#8dc2d9', low: '#6bb3d9', mid: '#409bd9', high: '#2e8fd9', sunGlow: '#ffeedd' },  // 15:00
    { horizon: '#8dc2d9', low: '#6bb3d9', mid: '#409bd9', high: '#2e8fd9', sunGlow: '#ffeedd' },  // 16:00
    { horizon: '#ca884f', low: '#a97873', mid: '#5d7caf', high: '#20558f', sunGlow: '#ffcb96' },  // 17:00
    { horizon: '#782218', low: '#40203b', mid: '#101034', high: '#070b1a', sunGlow: '#cf5625' },  // 18:00
    { horizon: '#151224', low: '#0d0e17', mid: '#060710', high: '#040508', sunGlow: '#000000' },  // 19:00
    { horizon: '#151224', low: '#0d0e17', mid: '#060710', high: '#040508', sunGlow: '#000000' },  // 20:00
    { horizon: '#151224', low: '#0d0e17', mid: '#060710', high: '#040508', sunGlow: '#000000' },  // 21:00
    { horizon: '#151224', low: '#0d0e17', mid: '#060710', high: '#040508', sunGlow: '#000000' },  // 22:00
    { horizon: '#151224', low: '#0d0e17', mid: '#060710', high: '#040508', sunGlow: '#000000' },  // 23:00
  ],}

// Active anchor cards. Phase A: identical to procedural seed. Phase B
// will override these per-season per Wren's artistic eye.
export const ANCHOR_CARDS = ANCHOR_CARDS_PROCEDURAL

// ─── Hex / RGB helpers (CPU-side; shader does its own) ────────────────
function hexToRGB(hex) {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3
    ? h.split('').map(c => c + c).join('')
    : h, 16)
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]
}
