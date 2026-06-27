// Extract clean, normalized records from the raw crawl (SQLite json_blocks)
// into portable JSON files under data/clean/. No network, no re-crawl.
//
//   node scripts/extract.mjs
//
// Two reliable sources, used for what each does best:
//  - App profiles (description, homepage, brand, icon, affiliate, tier) are
//    harvested from EVERY page by scanning all {"id":..} entities and keeping
//    the richest occurrence per app.
//  - Ratings / recommendations / criteria come from COMPARISON pages, where the
//    data is fully nested inline (ssgComparisonApps). Each rating's criterion is
//    resolved from its `...categoryCriteria:docs:N` reference index.

import { DatabaseSync } from "node:sqlite";
import { mkdirSync, writeFileSync } from "node:fs";

const DB_PATH = process.env.DB_PATH || "data/efficient.db";
const OUT_DIR = process.env.OUT_DIR || "data/clean";
const db = new DatabaseSync(DB_PATH);

const apps = new Map();
const categories = new Map();
const criteria = new Map();
const categoryCriteria = new Map();   // ccId -> {id, category_id, criterion_id}
const ccToCriterion = new Map();      // categoryCriterion.id -> criterion.id
const categoryRecs = new Map();       // `${appId}:${catId}` -> rec
const ratings = new Map();            // ratingId -> rating
const comparisons = new Map();
const comparisonApps = new Set();     // `${compId}:${appId}:${pos}`
const videos = new Map();
const comparisonVideos = new Set();   // `${compId}:${videoId}`
const screenshots = new Map();
const deals = new Map();               // dealId -> deal

// ---------- low-level parsing ----------
function balancedAt(str, start) {
  const open = str[start], close = open === "[" ? "]" : "}";
  let depth = 0, inStr = false, esc = false;
  for (let j = start; j < str.length; j++) {
    const c = str[j];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') { inStr = true; continue; }
    if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) return str.slice(start, j + 1); }
  }
  return null;
}
function extractAfter(str, key) {
  const i = str.indexOf(key);
  if (i < 0) return null;
  let s = i + key.length;
  while (s < str.length && str[s] !== "[" && str[s] !== "{") s++;
  return s < str.length ? balancedAt(str, s) : null;
}
const imgUrl = (a) => (a && typeof a === "object" ? a.url || null : null);

// Resolve a Next.js RSC reference string against a page root, following the path
// after `props:` (e.g. ssgComparisonApps:0:categoryRecommendations:docs:2:category).
// Follows nested refs so app B's deduped references into app A resolve too.
function resolveRef(root, ref, depth = 0) {
  if (typeof ref !== "string" || !ref.startsWith("$") || depth > 8) return typeof ref === "object" ? ref : null;
  const pi = ref.indexOf("props:");
  if (pi < 0) return null;
  let cur = root;
  for (const tok of ref.slice(pi + 6).split(":")) {
    if (cur == null || typeof cur !== "object") return null;
    cur = cur[/^\d+$/.test(tok) ? Number(tok) : tok];
    if (typeof cur === "string" && cur.startsWith("$")) cur = resolveRef(root, cur, depth + 1);
  }
  return cur;
}
const deref = (root, v) => (typeof v === "string" && v.startsWith("$") ? resolveRef(root, v) : v);

// ---------- recorders ----------
function isApp(o) {
  return o && typeof o === "object" && o.slug && o.name &&
    ("partnershipTier" in o || "brandBackgroundColor" in o || "brandPrimaryColor" in o || o.glyph || o.homepageImage || o.affiliateLink || o.categoryRecommendations || "description" in o);
}
function recordApp(o) {
  if (o.id == null) return;
  const e = apps.get(o.id) || { id: o.id };
  e.slug ??= o.slug; e.name ??= o.name;
  if (e.description == null && o.description) e.description = o.description;
  if (e.partnership_tier == null && o.partnershipTier) e.partnership_tier = o.partnershipTier;
  if (e.brand_background_color == null && o.brandBackgroundColor) e.brand_background_color = o.brandBackgroundColor;
  if (e.brand_primary_color == null && o.brandPrimaryColor) e.brand_primary_color = o.brandPrimaryColor;
  if (e.brand_secondary_color == null && o.brandSecondaryColor) e.brand_secondary_color = o.brandSecondaryColor;
  if (e.brand_tertiary_color == null && o.brandTertiaryColor) e.brand_tertiary_color = o.brandTertiaryColor;
  if (e.icon_url == null) e.icon_url = imgUrl(o.icon);
  if (e.glyph_url == null) e.glyph_url = imgUrl(o.glyph);
  if (e.homepage_url == null) e.homepage_url = imgUrl(o.homepageImage);
  if (e.affiliate_short_link == null && o.affiliateLink?.shortLink) e.affiliate_short_link = o.affiliateLink.shortLink;
  if (e.affiliate_epc == null && o.affiliateLink?.epcValue != null) e.affiliate_epc = o.affiliateLink.epcValue;
  apps.set(o.id, e);
}
function recordCategory(o) {
  if (!o || o.id == null) return;
  if (!categories.has(o.id))
    categories.set(o.id, { id: o.id, slug: o.slug ?? null, name: o.name ?? null, icon: o.icon ?? null, is_broad_category: o.isBroadCategory ? 1 : 0, featured_order: o.featuredOrder ?? null });
  const docs = o.categoryCriteria?.docs;
  if (Array.isArray(docs)) for (const cc of docs) if (cc && typeof cc === "object") recordCategoryCriterion(cc, o.id);
}
function recordCriterion(o) {
  if (o && typeof o === "object" && o.id != null && o.name && !criteria.has(o.id))
    criteria.set(o.id, { id: o.id, name: o.name, icon: o.icon ?? null });
}
function recordCategoryCriterion(cc, categoryId) {
  if (!cc || cc.id == null) return;
  if (cc.criterion) { recordCriterion(cc.criterion); ccToCriterion.set(cc.id, cc.criterion.id); }
  if (!categoryCriteria.has(cc.id))
    categoryCriteria.set(cc.id, { id: cc.id, category_id: categoryId ?? (typeof cc.category === "object" ? cc.category.id : null), criterion_id: cc.criterion?.id ?? null });
}

// Process one comparison app: profile, recommendations, and ratings.
// Ratings live on `app.review`, not under recommendations. Each rating's
// `categoryCriterion` is a reference string of the form
//   ...categoryRecommendations:docs:<R>:category:categoryCriteria:docs:<C>
// which pins both its category (rec index R) and criterion (criteria index C).
function walkComparisonApp(app, root) {
  if (!isApp(app)) return;
  recordApp(app);

  const recDocs = app.categoryRecommendations?.docs || [];
  for (const rec of recDocs) {
    if (!rec || typeof rec !== "object") continue;
    // category may be a cross-app reference string — resolve it to the real object/id
    const cat = deref(root, rec.category);
    const catId = (cat && typeof cat === "object") ? cat.id : null;
    if (cat && typeof cat === "object") recordCategory(cat);
    if (app.id != null && catId != null) {
      const key = `${app.id}:${catId}`;
      if (!categoryRecs.has(key)) categoryRecs.set(key, {
        app_id: app.id, category_id: catId, recommendation: rec.recommendation ?? null,
        classification: rec.classification ?? null, best_for: rec.bestFor ?? null,
        summary: rec.summary ? JSON.stringify(rec.summary) : null,
      });
    }
  }

  for (const review of app.review?.docs || []) {
    let primaryCat = null;
    for (const r of review?.reviewCategoryCriterionRating?.docs || []) {
      if (!r || r.id == null || !("rating" in r)) continue;
      let catId = null, critId = null;
      // The categoryCriterion may be an object, or a ref that resolves (even
      // across apps) to a categoryCriterion node {id, category, criterion}.
      const cc = resolveRef(root, r.categoryCriterion) || (typeof r.categoryCriterion === "object" ? r.categoryCriterion : null);
      if (cc && typeof cc === "object") {
        critId = cc.criterion?.id ?? ccToCriterion.get(cc.id) ?? null;
        const cat = deref(root, cc.category);
        if (cat && typeof cat === "object") catId = cat.id;
      }
      if (catId != null) primaryCat = catId;
      if (!ratings.has(r.id)) ratings.set(r.id, {
        id: r.id, app_id: app.id, category_id: catId, criterion_id: critId,
        rating: r.rating, is_applicable: r.isApplicable ? 1 : 0,
        summary: r.summary ? JSON.stringify(r.summary) : null,
      });
    }
    // the review's bestFor IS the ranking tagline ("Best modern bank…"); attach it
    // to this app's recommendation for the review's (primary) category.
    if (review?.bestFor && app.id != null && primaryCat != null) {
      const key = `${app.id}:${primaryCat}`;
      const rec = categoryRecs.get(key) || { app_id: app.id, category_id: primaryCat, recommendation: null, classification: null, best_for: null, summary: null };
      if (!rec.best_for) rec.best_for = review.bestFor;
      categoryRecs.set(key, rec);
    }
  }

  // screenshots belong to this app
  for (const sc of app.screenshots?.docs || []) {
    if (sc?.id != null && sc.url && !screenshots.has(sc.id))
      screenshots.set(sc.id, {
        id: sc.id, app_id: app.id, url: sc.url, alt: sc.alt ?? null,
        screenshot_order: sc.screenshotOrder ?? null, caption: sc.caption ? JSON.stringify(sc.caption) : null,
      });
  }
}

// Harvest full video definitions (id + url + duration) wherever they appear,
// since most pages only carry id+name references back to these.
function harvestVideos(text) {
  let idx = 0;
  while (true) {
    const s = text.indexOf('"datePublished"', idx);
    if (s < 0) break;
    idx = s + 14;
    const objStart = text.lastIndexOf('{"id":', s);
    if (objStart < 0) continue;
    const raw = balancedAt(text, objStart);
    if (!raw) continue;
    let v; try { v = JSON.parse(raw); } catch { continue; }
    if (v.id == null || typeof v.url !== "string" || !v.url.startsWith("http")) continue;
    const e = videos.get(v.id) || { id: v.id, name: null, url: null, duration: null, date_published: null, thumbnail: null };
    if (!e.name && v.name) e.name = v.name;
    if (!e.url) e.url = v.url;
    if (!e.duration && v.duration) e.duration = v.duration;
    if (!e.date_published && v.datePublished) e.date_published = v.datePublished;
    if (!e.thumbnail) e.thumbnail = imgUrl(v.thumbnail);
    videos.set(v.id, e);
  }
}

// Harvest deal definitions (have displayName + app id) wherever they appear.
function harvestDeals(text) {
  let idx = 0;
  while (true) {
    const s = text.indexOf('"displayName"', idx);
    if (s < 0) break;
    idx = s + 13;
    const objStart = text.lastIndexOf('{"id":', s);
    if (objStart < 0) continue;
    const raw = balancedAt(text, objStart);
    if (!raw) continue;
    let d; try { d = JSON.parse(raw); } catch { continue; }
    if (d.id == null || !d.displayName) continue;
    const appId = typeof d.app === "object" ? d.app.id : (typeof d.app === "number" ? d.app : null);
    const e = deals.get(d.id) || { id: d.id, app_id: null, display_name: null, start_date: null, end_date: null };
    if (!e.display_name) e.display_name = d.displayName;
    if (e.app_id == null && appId != null) e.app_id = appId;
    if (!e.start_date && d.startDate) e.start_date = d.startDate;
    if (!e.end_date && d.endDate) e.end_date = d.endDate;
    deals.set(d.id, e);
  }
}

// Harvest every {"id":..} entity in a page's text; record app profiles + categories.
// We scan ALL entity starts (including nested ones) so that the richest app record
// — the one carrying description/homepage/brand — is never missed.
function harvestProfiles(text) {
  let idx = 0;
  while (true) {
    const s = text.indexOf('{"id":', idx);
    if (s < 0) break;
    idx = s + 6;
    // cheap pre-filter: only parse objects that look like an app or category
    const peek = text.slice(s, s + 4000);
    if (!/"slug":"/.test(peek)) continue;
    const raw = balancedAt(text, s);
    if (!raw) continue;
    let o; try { o = JSON.parse(raw); } catch { continue; }
    if (isApp(o)) recordApp(o);
    else if (o.slug && o.name && ("categoryCriteria" in o || "isBroadCategory" in o)) recordCategory(o);
    if (o.criterion) recordCriterion(o.criterion);
  }
}

// ---------- main ----------
// Profiles/videos are harvested from EVERY crawled page (descriptions live on
// /best, /alternatives, /deals pages too); comparison-specific data is only read
// from /compare pages (guarded by the ssgComparisonApps check below).
const pages = db.prepare("SELECT id, url FROM pages").all();
let processed = 0;

for (const page of pages) {
  const row = db.prepare("SELECT body FROM json_blocks WHERE page_id=? AND kind='next-flight-text'").get(page.id);
  if (!row) continue;
  const t = row.body;

  // profiles + full video/deal defs from every page (richest wins)
  harvestProfiles(t);
  harvestVideos(t);
  harvestDeals(t);

  // comparison-only: ratings, recs, comparison, videos, screenshots
  const appsRaw = extractAfter(t, '"ssgComparisonApps":');
  if (appsRaw) {
    try {
      const arr = JSON.parse(appsRaw);
      const root = { ssgComparisonApps: arr };
      for (const app of arr) walkComparisonApp(app, root);

      const compRaw = extractAfter(t, '"ssgComparison":');
      if (compRaw) {
        const c = JSON.parse(compRaw);
        if (c.id != null && !comparisons.has(c.id)) {
          comparisons.set(c.id, {
            id: c.id, slug: new URL(page.url).pathname.replace("/compare/", "").replace(/\/$/, ""),
            name: c.name ?? null, tldr: c.tldr ? JSON.stringify(c.tldr) : null,
            featured_order: c.featuredOrder ?? null, is_featured: c.isFeatured ? 1 : 0,
            last_published_at: c.lastPublishedAt ?? null, last_isr_date: c.lastIsrDate ?? null,
          });
          (c.comparisonApps?.docs || []).forEach((d, idx) => {
            let appId = typeof d.app === "object" ? d.app.id : null;
            if (appId == null && typeof d.app === "string") {
              const m = d.app.match(/ssgComparisonApps:(\d+)/);
              if (m) appId = arr[Number(m[1])]?.id ?? null;
            }
            if (appId != null) comparisonApps.add(`${c.id}:${appId}:${d.order ?? idx + 1}`);
          });
        }
        // link this comparison's videos (ssgVideo on the page) -> comparison
        if (c.id != null) {
          const vidRaw = extractAfter(t, '"ssgVideo":');
          if (vidRaw) try {
            for (const item of JSON.parse(vidRaw)) {
              const v = item.video || item;
              if (v?.id != null) comparisonVideos.add(`${c.id}:${v.id}`);
            }
          } catch { /* ignore */ }
        }
      }

      // videos/deals harvested per-page; screenshots per-app (walkComparisonApp)
    } catch { /* skip malformed page */ }
  }
  processed++;
}

// ---------- backfill: category_criteria.criterion_id from the global cc->criterion map ----------
for (const cc of categoryCriteria.values())
  if (cc.criterion_id == null) cc.criterion_id = ccToCriterion.get(cc.id) ?? null;

// ---------- write ----------
mkdirSync(OUT_DIR, { recursive: true });
const dump = (name, rows) => writeFileSync(`${OUT_DIR}/${name}.json`, JSON.stringify(rows));
dump("apps", [...apps.values()]);
dump("categories", [...categories.values()]);
dump("criteria", [...criteria.values()]);
dump("category_criteria", [...categoryCriteria.values()]);
dump("category_recommendations", [...categoryRecs.values()].map((r, i) => ({ id: i + 1, ...r })));
dump("ratings", [...ratings.values()]);
dump("comparisons", [...comparisons.values()]);
dump("comparison_apps", [...comparisonApps].map((s, i) => { const [comparison_id, app_id, position] = s.split(":").map(Number); return { id: i + 1, comparison_id, app_id, position }; }));
dump("videos", [...videos.values()].filter((v) => v.url));   // drop reference-only stubs
dump("comparison_videos", [...comparisonVideos].map((s, i) => { const [comparison_id, video_id] = s.split(":").map(Number); return { id: i + 1, comparison_id, video_id }; }));
dump("screenshots", [...screenshots.values()]);
dump("deals", [...deals.values()]);

const ratedApps = new Set([...ratings.values()].map((r) => r.app_id)).size;
const ratedWithCrit = [...ratings.values()].filter((r) => r.criterion_id != null).length;
console.table({
  pages_processed: processed, apps: apps.size, categories: categories.size, criteria: criteria.size,
  category_criteria: categoryCriteria.size, category_recommendations: categoryRecs.size,
  ratings: ratings.size, ratings_with_criterion: ratedWithCrit, apps_with_ratings: ratedApps,
  comparisons: comparisons.size, comparison_apps: comparisonApps.size, videos: videos.size, screenshots: screenshots.size,
});
db.close();
