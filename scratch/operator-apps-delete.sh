#!/bin/sh
# operator-apps-delete.sh — JACOB'S, on Boz's relay. ⛔ Not run by any agent.
#
# The five operator apps (cartograph, arborist, meteorologist, preview, street-furniture) were shipped with every
# kit-player publish and are public at staging.theward.online/_player/ and assets.theward.online (2026-10-30 trace).
# These are exactly the files only those apps reach: each operator entry's import graph minus the player's own
# (index.html → transitive imports), cross-checked that no other published file names any of them. Nothing else.
#
# ⛔ ORDER: run this only AFTER the first kit-player publish with groyne/player-ships-only-the-player, which writes a
# staging/player/manifest.json without them. Before that, the manifest still lists them and a legacy Promote would
# 404 on one and refuse.
# The security sweep of these files found nothing secret (Boz has the report).
set -e
npx wrangler r2 object delete "theward-assets/staging/player/arborist.html" --remote
npx wrangler r2 object delete "theward-assets/staging/player/assets/@react-refresh-CXHq4d7E.js" --remote
npx wrangler r2 object delete "theward-assets/staging/player/assets/ArboristApp-DxmrC6Z5.js" --remote
npx wrangler r2 object delete "theward-assets/staging/player/assets/MeteorologistApp-B2Dn7U5a.js" --remote
npx wrangler r2 object delete "theward-assets/staging/player/assets/TodChannel-Dg3O4YLk.js" --remote
npx wrangler r2 object delete "theward-assets/staging/player/assets/arborist-BLoXKHUB.js" --remote
npx wrangler r2 object delete "theward-assets/staging/player/assets/bootOrRefuse-DqZjIhdX.js" --remote
npx wrangler r2 object delete "theward-assets/staging/player/assets/cartograph-BTnHVpjJ.css" --remote
npx wrangler r2 object delete "theward-assets/staging/player/assets/cartograph-CJpk5y2N.js" --remote
npx wrangler r2 object delete "theward-assets/staging/player/assets/meteorologist-BBkly7Kh.js" --remote
npx wrangler r2 object delete "theward-assets/staging/player/assets/preview-qeNayMVx.js" --remote
npx wrangler r2 object delete "theward-assets/staging/player/assets/shots-D5dLzurS.js" --remote
npx wrangler r2 object delete "theward-assets/staging/player/assets/street-furniture-D2OnN5IF.js" --remote
npx wrangler r2 object delete "theward-assets/staging/player/cartograph.html" --remote
npx wrangler r2 object delete "theward-assets/staging/player/meteorologist.html" --remote
npx wrangler r2 object delete "theward-assets/staging/player/preview.html" --remote
npx wrangler r2 object delete "theward-assets/staging/player/street-furniture.html" --remote
npx wrangler r2 object delete "theward-assets/player/provincetown/arborist.html" --remote
npx wrangler r2 object delete "theward-assets/player/provincetown/assets/@react-refresh-CXHq4d7E.js" --remote
npx wrangler r2 object delete "theward-assets/player/provincetown/assets/StageApp-CiMQvVzf.js" --remote
npx wrangler r2 object delete "theward-assets/player/provincetown/assets/TodChannel-DntigQzI.js" --remote
npx wrangler r2 object delete "theward-assets/player/provincetown/assets/arborist-mjZI--4i.js" --remote
npx wrangler r2 object delete "theward-assets/player/provincetown/assets/cameraTween-CT5vpDS9.js" --remote
npx wrangler r2 object delete "theward-assets/player/provincetown/assets/cartograph-C0ZjEz2h.js" --remote
npx wrangler r2 object delete "theward-assets/player/provincetown/assets/cartograph-jQuNHsFA.css" --remote
npx wrangler r2 object delete "theward-assets/player/provincetown/assets/meteorologist-_7CzHoVR.js" --remote
npx wrangler r2 object delete "theward-assets/player/provincetown/assets/preview-v062tooS.js" --remote
npx wrangler r2 object delete "theward-assets/player/provincetown/cartograph.html" --remote
npx wrangler r2 object delete "theward-assets/player/provincetown/meteorologist.html" --remote
npx wrangler r2 object delete "theward-assets/player/provincetown/preview.html" --remote
