#!/bin/bash
# Download missing wikimedia images from attribution.json
# Uses curl with retries and rate limiting

set -e
cd "$(dirname "$0")/.."

echo "Generating download list..."
python3 << 'PYEOF'
import json, os

with open('public/photos/lafayette-square/attribution.json') as f:
    attrs = json.load(f)

missing = []
for a in attrs:
    filepath = a['file'].lstrip('/')
    if not os.path.exists(filepath):
        missing.append((filepath, a['source_url']))

print(f"Missing: {len(missing)} images")

with open('/tmp/wikimedia_downloads.txt', 'w') as f:
    for path, url in missing:
        f.write(f"{path}\t{url}\n")
PYEOF

TOTAL=$(wc -l < /tmp/wikimedia_downloads.txt | tr -d ' ')
echo "Downloading $TOTAL images..."

COUNT=0
FAIL=0

while IFS=$'\t' read -r filepath url; do
    COUNT=$((COUNT + 1))

    # Ensure directory exists
    dir=$(dirname "$filepath")
    mkdir -p "$dir"

    # Download with retry
    if curl -sL --retry 2 --max-time 30 -o "$filepath" "$url" 2>/dev/null; then
        # Verify it's a valid image (not an error page)
        size=$(stat -f%z "$filepath" 2>/dev/null || echo 0)
        if [ "$size" -lt 1000 ]; then
            echo "  [$COUNT/$TOTAL] SKIP (too small): $filepath"
            rm -f "$filepath"
            FAIL=$((FAIL + 1))
        else
            if [ $((COUNT % 25)) -eq 0 ]; then
                echo "  [$COUNT/$TOTAL] OK"
            fi
        fi
    else
        echo "  [$COUNT/$TOTAL] FAIL: $filepath"
        FAIL=$((FAIL + 1))
    fi

    # Small delay to be polite to wikimedia
    sleep 0.15
done < /tmp/wikimedia_downloads.txt

echo ""
echo "Done! Downloaded $((COUNT - FAIL))/$TOTAL images ($FAIL failures)"
