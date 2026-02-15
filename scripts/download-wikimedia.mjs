/**
 * Download all Lafayette Square photos from Wikimedia Commons.
 *
 * - Fetches file list from the category + subcategories
 * - Gets metadata (URL, description, license, artist) via imageinfo API
 * - Downloads 1200px thumbnails
 * - Organizes by street based on filename
 * - Writes attribution JSON
 *
 * Usage: node scripts/download-wikimedia.mjs [--dry-run]
 */

import { mkdirSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const BASE = 'public/photos/lafayette-square';
const API = 'https://commons.wikimedia.org/w/api.php';
const THUMB_WIDTH = 1200;
const DRY_RUN = process.argv.includes('--dry-run');

// Street classification based on filename patterns
function classifyStreet(title) {
  const t = title.toLowerCase();
  if (t.includes('benton place') || t.includes('benton pl'))  return 'benton-place';
  if (t.includes('lafayette ave') || t.includes('lafayette avenue')) return 'lafayette-ave';
  if (t.includes('mississippi ave') || t.includes('mississippi avenue') || t.includes('mississippi st')) return 'mississippi-ave';
  if (t.includes('missouri ave') || t.includes('missouri avenue')) return 'missouri-ave';
  if (t.includes('park ave') || t.includes('park avenue')) {
    if (t.includes('mississippi')) return 'park-and-mississippi';
    if (t.includes('missouri'))   return 'park-and-missouri';
    if (t.includes('vail'))       return 'park-and-vail';
    return 'park-ave';
  }
  if (t.includes('mackay') || t.includes('mackay place')) return 'mackay-place';
  if (t.includes('chouteau'))    return 'chouteau-ave';
  if (t.includes('dolman'))      return 'dolman-st';
  if (t.includes('jefferson'))   return 'jefferson-ave';
  if (t.includes('whittemore'))  return 'whittemore-place';
  if (t.includes('kennett'))     return 'kennett-place';
  if (t.includes('albion'))      return 'albion-place';
  if (t.includes('lasalle'))     return 'lasalle-st';
  if (t.includes('lafayette park') || t.includes('lafayette square')) return 'lafayette-park';
  if (t.includes('benton statue') || t.includes('thomas hart benton')) return 'benton-statue';
  return 'other';
}

// Fetch JSON from Wikimedia API
async function apiFetch(params) {
  const url = new URL(API);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('format', 'json');
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// Get all file titles from a category (handles pagination)
async function getCategoryFiles(catTitle) {
  const files = [];
  let cmcontinue = null;
  while (true) {
    const params = {
      action: 'query',
      list: 'categorymembers',
      cmtitle: catTitle,
      cmtype: 'file',
      cmlimit: '500',
    };
    if (cmcontinue) params.cmcontinue = cmcontinue;
    const data = await apiFetch(params);
    const members = data.query?.categorymembers || [];
    files.push(...members.map(m => m.title));
    cmcontinue = data.continue?.cmcontinue;
    if (!cmcontinue) break;
  }
  return files;
}

// Get image info (URL, description, license, artist) for a batch of titles
async function getImageInfo(titles) {
  const results = [];
  // API limit is 50 titles per request
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const data = await apiFetch({
      action: 'query',
      titles: batch.join('|'),
      prop: 'imageinfo',
      iiprop: 'url|extmetadata|size|mime',
      iiurlwidth: String(THUMB_WIDTH),
    });
    const pages = data.query?.pages || {};
    for (const page of Object.values(pages)) {
      const info = page.imageinfo?.[0];
      if (!info) continue;
      const ext = info.extmetadata || {};
      results.push({
        title: page.title,
        thumbUrl: info.thumburl,
        fullUrl: info.url,
        width: info.width,
        height: info.height,
        mime: info.mime,
        description: ext.ImageDescription?.value?.replace(/<[^>]*>/g, '') || '',
        artist: ext.Artist?.value?.replace(/<[^>]*>/g, '') || '',
        license: ext.LicenseShortName?.value || '',
        date: ext.DateTimeOriginal?.value || ext.DateTime?.value || '',
      });
    }
  }
  return results;
}

// Rate-limit helper: wait ms
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Download a single file using curl (more reliable with Wikimedia)
function downloadFile(url, destPath) {
  execSync(`curl -sL -o "${destPath}" "${url}"`, { timeout: 30000 });
  const stat = statSync(destPath);
  if (stat.size < 1000) {
    throw new Error(`File too small (${stat.size} bytes), likely an error page`);
  }
  return stat.size;
}

// Count existing files in a directory
function countExisting(dir) {
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).filter(f => f.endsWith('.jpg') || f.endsWith('.jpeg')).length;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Fetching file list from Wikimedia Commons...');

  // Get all files from main category + subcategories
  const mainFiles = await getCategoryFiles('Category:Lafayette Square (St. Louis, Missouri)');
  const bentonFiles = await getCategoryFiles('Category:Thomas Hart Benton statue by Harriet Goodhue Hosmer');
  const allTitles = [...new Set([...mainFiles, ...bentonFiles])];
  console.log(`Found ${allTitles.length} unique files (${mainFiles.length} main + ${bentonFiles.length} Benton statue)\n`);

  // Classify by street
  const byStreet = {};
  for (const title of allTitles) {
    const street = classifyStreet(title);
    if (!byStreet[street]) byStreet[street] = [];
    byStreet[street].push(title);
  }

  // Show breakdown
  for (const [street, titles] of Object.entries(byStreet).sort()) {
    const existing = countExisting(join(BASE, street));
    console.log(`  ${street}: ${titles.length} files (${existing} already downloaded)`);
  }

  if (DRY_RUN) {
    console.log('\n--dry-run: stopping before downloads.');
    return;
  }

  // Ensure directories
  mkdirSync(BASE, { recursive: true });
  for (const street of Object.keys(byStreet)) {
    mkdirSync(join(BASE, street), { recursive: true });
  }

  // Fetch metadata for all files
  console.log('\nFetching metadata...');
  const allInfo = await getImageInfo(allTitles);
  console.log(`Got metadata for ${allInfo.length} files\n`);

  // Track what we download for attribution
  const attribution = [];
  let downloaded = 0;
  let skipped = 0;
  let errors = 0;

  // Process by street
  for (const [street, titles] of Object.entries(byStreet).sort()) {
    const dir = join(BASE, street);
    const existingCount = countExisting(dir);

    // Get info for files in this street, sorted by title for stable ordering
    const streetInfo = allInfo
      .filter(i => titles.includes(i.title))
      .sort((a, b) => a.title.localeCompare(b.title));

    for (let idx = 0; idx < streetInfo.length; idx++) {
      const info = streetInfo[idx];
      const num = String(idx + 1).padStart(3, '0');
      const destPath = join(dir, `${num}.jpg`);

      // Attribution entry regardless of download
      attribution.push({
        file: `/${join(BASE, street, num + '.jpg')}`,
        wikimedia_title: info.title.replace('File:', ''),
        street,
        artist: info.artist,
        license: info.license,
        description: info.description,
        date: info.date,
        source_url: info.fullUrl,
      });

      // Skip if already exists
      if (existsSync(destPath)) {
        skipped++;
        continue;
      }

      const thumbUrl = info.thumbUrl || info.fullUrl;
      try {
        const bytes = await downloadFile(thumbUrl, destPath);
        downloaded++;
        const kb = Math.round(bytes / 1024);
        if (downloaded % 10 === 0 || downloaded === 1) {
          console.log(`  [${downloaded}] ${street}/${num}.jpg (${kb}K) — ${info.title.replace('File:', '').substring(0, 60)}`);
        }
        // Rate limit: 500ms between downloads to avoid 429s
        await sleep(500);
      } catch (err) {
        console.error(`  ERROR: ${info.title} — ${err.message}`);
        errors++;
      }
    }
  }

  // Write attribution JSON
  const attrPath = join(BASE, 'attribution.json');
  writeFileSync(attrPath, JSON.stringify(attribution, null, 2));

  console.log(`\nDone!`);
  console.log(`  Downloaded: ${downloaded}`);
  console.log(`  Skipped (existing): ${skipped}`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Attribution: ${attrPath} (${attribution.length} entries)`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
