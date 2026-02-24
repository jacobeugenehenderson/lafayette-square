var GAS_API = "https://script.google.com/macros/s/AKfycbxv3JihCx0U7JfGqle6ZpsLamkRS5PAEGRn6_NaM0Nc7r5zdY7kyctDioScGy8nVcAqWQ/exec";
var ORIGIN = "https://jacobeugenehenderson.github.io";
var VANITY = "https://jacobhenderson.studio/lafayette-square";
var INDEX_URL = ORIGIN + "/lafayette-square/";

var listingsCache = null;
var cacheTime = 0;
var CACHE_TTL = 5 * 60 * 1000;

async function fetchListings() {
  if (listingsCache && Date.now() - cacheTime < CACHE_TTL) return listingsCache;
  try {
    var res = await fetch(GAS_API + "?action=listings");
    var json = await res.json();
    listingsCache = json.data || [];
    cacheTime = Date.now();
  } catch (e) {
    listingsCache = listingsCache || [];
  }
  return listingsCache;
}

function escHtml(s) {
  return (s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

export default {
  async fetch(request) {
    var url = new URL(request.url);
    var path = url.pathname;

    var placeMatch = path.match(/^\/lafayette-square\/place\/([^/]+)$/);

    // Non-place routes: straight proxy
    if (!placeMatch) {
      var target = ORIGIN + path + url.search;
      return fetch(target, { redirect: "follow" });
    }

    // Place routes: fetch index.html (not the 404 page) and inject OG tags
    var res = await fetch(INDEX_URL, { redirect: "follow" });

    var listingId = placeMatch[1];
    var listings = await fetchListings();
    var listing = listings.find(function(l) { return l.id === listingId; });

    if (!listing) {
      return new Response(res.body, { status: 200, headers: res.headers });
    }

    var title = escHtml(listing.name || "Lafayette Square");
    var photo = listing.photos && listing.photos[0]
      ? (listing.photos[0].startsWith("http") ? listing.photos[0] : VANITY + "/" + listing.photos[0].replace(/^\//, ""))
      : VANITY + "/photos/og-preview.jpg";
    var placeUrl = VANITY + "/place/" + listingId;

    var ogTags = '<meta property="og:title" content="' + title + '" />\n'
      + '    <meta property="og:image" content="' + escHtml(photo) + '" />\n'
      + '    <meta property="og:type" content="website" />\n'
      + '    <meta property="og:url" content="' + escHtml(placeUrl) + '" />\n'
      + '    <meta name="twitter:card" content="summary_large_image" />\n'
      + '    <meta name="twitter:title" content="' + title + '" />\n'
      + '    <meta name="twitter:image" content="' + escHtml(photo) + '" />';

    var html = await res.text();
    html = html.replace(
      /<!-- Open Graph[^]*?twitter:image"[^>]*\/>/,
      ogTags
    );
    html = html.replace(
      /<title>[^<]*<\/title>/,
      "<title>" + title + " \u2014 Lafayette Square</title>"
    );

    var headers = new Headers(res.headers);
    headers.set("Content-Type", "text/html; charset=utf-8");

    return new Response(html, { status: 200, headers: headers });
  }
};
