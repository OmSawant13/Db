// Build a NEW SQLite DB in efficient.app's EXACT (normalized) schema — the shape
// described in efficient_schema.json — scoped to the 100 India apps and the
// comparisons among them. Re-normalizes our clean JSON (assets, affiliate_links,
// reviews split back out into their own tables).
//
//   node scripts/build_india_db.mjs   ->  data/efficient_india.sqlite

import { DatabaseSync } from "node:sqlite";
import { readFileSync, rmSync } from "node:fs";

const CLEAN = "data/clean";
const OUT = "data/efficient_india.sqlite";
const L = (n) => JSON.parse(readFileSync(`${CLEAN}/${n}.json`, "utf8"));

const appsAll = L("apps");
const cats = L("categories");
const criteria = L("criteria");
const catCrit = L("category_criteria");
const recsAll = L("category_recommendations");
const ratingsAll = L("ratings");
const compsAll = L("comparisons");
const compAppsAll = L("comparison_apps");
const screenshotsAll = L("screenshots");

// ---- merge our own generated content (data/generated.json) ----
const lexWrap = (t) => JSON.stringify({ root: { type: "root", format: "", indent: 0, version: 1, children: [{ type: "paragraph", format: "", indent: 0, version: 1, children: [{ mode: "normal", text: t, type: "text", style: "", detail: 0, format: 0, version: 1 }] }] } });
const genF = JSON.parse(readFileSync("data/generated.json", "utf8"));
const gAppId = (n) => appsAll.find((a) => a.name === n)?.id;
const gCatId = (n) => cats.find((c) => c.name === n)?.id;
const gCritId = (n) => criteria.find((c) => c.name === n)?.id;
let nCrit = Math.max(9999, ...criteria.map((c) => c.id)) + 1;
let nCC = Math.max(9999, ...catCrit.map((c) => c.id)) + 1;
let nRat = Math.max(999999, ...ratingsAll.map((r) => r.id)) + 1;
for (const [cn, crit] of Object.entries(genF.category_criteria || {})) {
  const cid = gCatId(cn); if (cid == null) continue;
  for (const crn of crit) {
    let id = gCritId(crn);
    if (id == null) { id = nCrit++; criteria.push({ id, name: crn, icon: null }); }
    if (!catCrit.some((cc) => cc.category_id === cid && cc.criterion_id === id)) catCrit.push({ id: nCC++, category_id: cid, criterion_id: id });
  }
}
for (const item of genF.content) {
  const aid = gAppId(item.app), cid = gCatId(item.category); if (aid == null || cid == null) continue;
  const rec = recsAll.find((r) => r.app_id === aid && r.category_id === cid);
  if (rec) { if (!rec.best_for) rec.best_for = item.best_for ?? null; if (!rec.summary && item.summary) rec.summary = lexWrap(item.summary); }
  for (const [crn, val] of Object.entries(item.ratings || {})) {
    const score = Array.isArray(val) ? val[0] : val, verdict = Array.isArray(val) ? val[1] : null;
    const crid = gCritId(crn); if (crid == null) continue;
    const ex = ratingsAll.find((r) => r.app_id === aid && r.category_id === cid && r.criterion_id === crid);
    if (!ex) ratingsAll.push({ id: nRat++, app_id: aid, category_id: cid, criterion_id: crid, rating: score, is_applicable: 1, summary: verdict ? lexWrap(verdict) : null });
    else if (verdict && (ex.summary === null || ex.summary === "") && ex.rating === score) ex.summary = lexWrap(verdict); // fill efficient's missing verdict (score must match)
  }
}

// ---- scope to the 100 India apps ----
const wantSlugs = new Set(readFileSync("india_top_apps.txt", "utf8").split("\n").map((s) => s.trim()).filter(Boolean)
  .map((nm) => appsAll.find((a) => a.name === nm)?.slug).filter(Boolean));
const apps = appsAll.filter((a) => wantSlugs.has(a.slug));
const appIds = new Set(apps.map((a) => a.id));

// comparisons where BOTH apps are in our 100
const compApps = compAppsAll.filter((ca) => appIds.has(ca.app_id));
const compCount = {};
compApps.forEach((ca) => { compCount[ca.comparison_id] = (compCount[ca.comparison_id] || 0) + 1; });
const keepCompIds = new Set(Object.entries(compCount).filter(([, n]) => n === 2).map(([id]) => Number(id)));
const comps = compsAll.filter((c) => keepCompIds.has(c.id));
const compAppsScoped = compApps.filter((ca) => keepCompIds.has(ca.comparison_id));

const recs = recsAll.filter((r) => appIds.has(r.app_id));
const ratings = ratingsAll.filter((r) => appIds.has(r.app_id));
const screenshots = screenshotsAll.filter((s) => appIds.has(s.app_id));
const catIdsUsed = new Set([...recs.map((r) => r.category_id), ...ratings.map((r) => r.category_id)]);
const critIdsUsed = new Set([...ratings.map((r) => r.criterion_id), ...catCrit.map((c) => c.criterion_id)].filter(Boolean));

// ---- DB + exact schema ----
try { rmSync(OUT); rmSync(OUT + "-wal"); rmSync(OUT + "-shm"); } catch {}
const db = new DatabaseSync(OUT);
db.exec(`
CREATE TABLE assets (
  id INTEGER PRIMARY KEY, url TEXT UNIQUE, filename TEXT, alt TEXT,
  coverage_percent REAL, x_offset_percent REAL, y_offset_percent REAL, width INTEGER, height INTEGER
);
CREATE TABLE affiliate_links (
  id INTEGER PRIMARY KEY, short_link TEXT, epc_value REAL, pass_referrer_url INTEGER, deleted_at TEXT
);
CREATE TABLE apps (
  id INTEGER PRIMARY KEY, slug TEXT UNIQUE, name TEXT, description TEXT,
  icon_asset_id INTEGER REFERENCES assets(id), glyph_asset_id INTEGER REFERENCES assets(id), homepage_asset_id INTEGER REFERENCES assets(id),
  brand_background_color TEXT, brand_primary_color TEXT, brand_secondary_color TEXT, brand_tertiary_color TEXT,
  partnership_tier TEXT, affiliate_link_id INTEGER REFERENCES affiliate_links(id)
);
CREATE TABLE categories (
  id INTEGER PRIMARY KEY, slug TEXT, name TEXT, icon TEXT, is_broad_category INTEGER
);
CREATE TABLE criteria (id INTEGER PRIMARY KEY, name TEXT, icon TEXT);
CREATE TABLE category_criteria (
  id INTEGER PRIMARY KEY, category_id INTEGER REFERENCES categories(id), criterion_id INTEGER REFERENCES criteria(id)
);
CREATE TABLE category_recommendations (
  id INTEGER PRIMARY KEY, app_id INTEGER REFERENCES apps(id), category_id INTEGER REFERENCES categories(id),
  recommendation TEXT, classification TEXT, best_for TEXT, summary TEXT
);
CREATE TABLE reviews (
  id INTEGER PRIMARY KEY, category_recommendation_id INTEGER REFERENCES category_recommendations(id), best_for TEXT
);
CREATE TABLE review_category_criterion_ratings (
  id INTEGER PRIMARY KEY, review_id INTEGER REFERENCES reviews(id),
  category_criterion_id INTEGER REFERENCES category_criteria(id), is_applicable INTEGER, rating INTEGER, summary TEXT
);
CREATE TABLE comparisons (
  id INTEGER PRIMARY KEY, name TEXT, slug TEXT, tldr TEXT, is_featured INTEGER, last_published_at TEXT
);
CREATE TABLE comparison_apps (
  id INTEGER PRIMARY KEY, comparison_id INTEGER REFERENCES comparisons(id), app_id INTEGER REFERENCES apps(id), "order" INTEGER
);
`);

const run = (sql, rows, map) => { const st = db.prepare(sql); db.exec("BEGIN"); for (const r of rows) st.run(...map(r)); db.exec("COMMIT"); };

// assets: from app icon/glyph/homepage urls + screenshots; dedup by url
const assetByUrl = new Map();
let assetId = 1;
const addAsset = (url) => { if (!url) return null; if (assetByUrl.has(url)) return assetByUrl.get(url); const id = assetId++; assetByUrl.set(url, id); return id; };
for (const a of apps) { a._icon = addAsset(a.icon_url); a._glyph = addAsset(a.glyph_url); a._home = addAsset(a.homepage_url); }
for (const s of screenshots) addAsset(s.url);
const fname = (u) => { try { return decodeURIComponent(u.split("/").pop()); } catch { return null; } };
run(`INSERT INTO assets (id,url,filename,alt,coverage_percent,x_offset_percent,y_offset_percent,width,height) VALUES (?,?,?,?,?,?,?,?,?)`,
  [...assetByUrl.entries()], ([url, id]) => [id, url, fname(url), null, null, null, null, null, null]);

// affiliate_links: one per app that has a short link
let afId = 1; const afByApp = new Map();
for (const a of apps) if (a.affiliate_short_link) { afByApp.set(a.id, afId++); }
run(`INSERT INTO affiliate_links (id,short_link,epc_value,pass_referrer_url,deleted_at) VALUES (?,?,?,?,?)`,
  apps.filter((a) => afByApp.has(a.id)), (a) => [afByApp.get(a.id), a.affiliate_short_link, a.affiliate_epc ?? null, null, null]);

// apps
run(`INSERT INTO apps (id,slug,name,description,icon_asset_id,glyph_asset_id,homepage_asset_id,brand_background_color,brand_primary_color,brand_secondary_color,brand_tertiary_color,partnership_tier,affiliate_link_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  apps, (a) => [a.id, a.slug, a.name, a.description ?? null, a._icon, a._glyph, a._home, a.brand_background_color ?? null, a.brand_primary_color ?? null, a.brand_secondary_color ?? null, a.brand_tertiary_color ?? null, a.partnership_tier === "none" ? null : a.partnership_tier ?? null, afByApp.get(a.id) ?? null]);

// categories / criteria / category_criteria (only used ones)
run(`INSERT INTO categories (id,slug,name,icon,is_broad_category) VALUES (?,?,?,?,?)`,
  cats.filter((c) => catIdsUsed.has(c.id)), (c) => [c.id, c.slug, c.name, c.icon ?? null, c.is_broad_category ?? 0]);
run(`INSERT INTO criteria (id,name,icon) VALUES (?,?,?)`,
  criteria.filter((c) => critIdsUsed.has(c.id)), (c) => [c.id, c.name, c.icon ?? null]);
const ccUsed = catCrit.filter((cc) => catIdsUsed.has(cc.category_id));
run(`INSERT INTO category_criteria (id,category_id,criterion_id) VALUES (?,?,?)`, ccUsed, (cc) => [cc.id, cc.category_id, cc.criterion_id ?? null]);
// map (cat,crit) -> category_criterion.id  for ratings
const ccByPair = new Map(); for (const cc of ccUsed) if (cc.criterion_id != null) ccByPair.set(cc.category_id + ":" + cc.criterion_id, cc.id);

// category_recommendations  (+ build review per rec)
run(`INSERT INTO category_recommendations (id,app_id,category_id,recommendation,classification,best_for,summary) VALUES (?,?,?,?,?,?,?)`,
  recs, (r) => [r.id, r.app_id, r.category_id, r.recommendation ?? null, r.classification ?? null, r.best_for ?? null, r.summary ?? null]);

// reviews: one per (app,category) recommendation
let revId = 1; const revByAppCat = new Map();
for (const r of recs) { const id = revId++; revByAppCat.set(r.app_id + ":" + r.category_id, id); }
run(`INSERT INTO reviews (id,category_recommendation_id,best_for) VALUES (?,?,?)`,
  recs.map((r, i) => ({ rid: i, r })), ({ r }) => [revByAppCat.get(r.app_id + ":" + r.category_id), r.id, r.best_for ?? null]);

// review_category_criterion_ratings: our ratings, linked to review + category_criterion
run(`INSERT INTO review_category_criterion_ratings (id,review_id,category_criterion_id,is_applicable,rating,summary) VALUES (?,?,?,?,?,?)`,
  ratings, (r) => [r.id, revByAppCat.get(r.app_id + ":" + r.category_id) ?? null, ccByPair.get(r.category_id + ":" + r.criterion_id) ?? null, r.is_applicable ?? null, r.rating ?? null, r.summary ?? null]);

// comparisons + comparison_apps
run(`INSERT INTO comparisons (id,name,slug,tldr,is_featured,last_published_at) VALUES (?,?,?,?,?,?)`,
  comps, (c) => [c.id, c.name, c.slug, c.tldr ?? null, c.is_featured ?? 0, c.last_published_at ?? null]);
run(`INSERT INTO comparison_apps (id,comparison_id,app_id,"order") VALUES (?,?,?,?)`,
  compAppsScoped, (ca) => [ca.id, ca.comparison_id, ca.app_id, ca.position ?? null]);

db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
const counts = {};
for (const t of ["assets", "affiliate_links", "apps", "categories", "criteria", "category_criteria", "category_recommendations", "reviews", "review_category_criterion_ratings", "comparisons", "comparison_apps"])
  counts[t] = db.prepare(`SELECT count(*) n FROM ${t}`).get().n;
db.close();
console.log("Built", OUT, "(exact efficient schema, 100 India apps)");
console.table(counts);
