// Build a small, browsable SQLite DB from data/clean/*.json.
// Open the resulting file in any SQLite viewer (e.g. the add0n SQLite Viewer
// browser extension) to inspect the clean tables — it is only a few MB.
//
//   node scripts/build_clean_sqlite.mjs   ->  data/efficient_clean.sqlite
//
// Only "solid" columns are kept: any field efficient.app itself leaves blank for
// most rows (best_for, summary, featured_order, captions, etc.) is dropped as
// junk so every column in the resulting DB is meaningfully filled. The full
// extracted data (including dropped fields) still lives in data/clean/*.json.

import { DatabaseSync } from "node:sqlite";
import { readFileSync, rmSync } from "node:fs";

const CLEAN = process.env.OUT_DIR || "data/clean";
const OUT = process.env.CLEAN_DB || "data/efficient_clean.sqlite";

try { rmSync(OUT); rmSync(OUT + "-wal"); rmSync(OUT + "-shm"); } catch {}
const db = new DatabaseSync(OUT);
const load = (n) => JSON.parse(readFileSync(`${CLEAN}/${n}.json`, "utf8"));

db.exec(`
CREATE TABLE apps (
  id INTEGER PRIMARY KEY, slug TEXT, name TEXT, description TEXT, partnership_tier TEXT,
  brand_primary_color TEXT, brand_background_color TEXT, icon_url TEXT, homepage_url TEXT, affiliate_short_link TEXT
);
CREATE TABLE categories (id INTEGER PRIMARY KEY, slug TEXT, name TEXT, icon TEXT, is_broad_category INTEGER);
CREATE TABLE criteria (id INTEGER PRIMARY KEY, name TEXT, icon TEXT);
CREATE TABLE category_criteria (id INTEGER PRIMARY KEY, category_id INTEGER, criterion_id INTEGER);
CREATE TABLE category_recommendations (id INTEGER PRIMARY KEY, app_id INTEGER, category_id INTEGER, recommendation TEXT, classification TEXT, best_for TEXT, summary TEXT);
CREATE TABLE ratings (id INTEGER PRIMARY KEY, app_id INTEGER, category_id INTEGER, criterion_id INTEGER, rating INTEGER, is_applicable INTEGER, summary TEXT);
CREATE TABLE comparisons (id INTEGER PRIMARY KEY, slug TEXT, name TEXT, tldr TEXT, is_featured INTEGER, last_published_at TEXT);
CREATE TABLE comparison_apps (id INTEGER PRIMARY KEY, comparison_id INTEGER, app_id INTEGER, position INTEGER);
CREATE TABLE videos (id INTEGER PRIMARY KEY, name TEXT, url TEXT, duration TEXT, date_published TEXT);
CREATE TABLE comparison_videos (id INTEGER PRIMARY KEY, comparison_id INTEGER, video_id INTEGER);
CREATE TABLE screenshots (id INTEGER PRIMARY KEY, app_id INTEGER, url TEXT, alt TEXT, screenshot_order INTEGER);
CREATE TABLE deals (id INTEGER PRIMARY KEY, app_id INTEGER, display_name TEXT, start_date TEXT, end_date TEXT);
`);

function insertRows(table, cols, rows, tweak) {
  if (!rows.length) return 0;
  const ph = cols.map(() => "?").join(", ");
  const stmt = db.prepare(`INSERT OR IGNORE INTO ${table} (${cols.join(", ")}) VALUES (${ph})`);
  db.exec("BEGIN");
  for (const r of rows) {
    if (tweak) tweak(r);
    stmt.run(...cols.map((c) => (r[c] === undefined ? null : r[c])));
  }
  db.exec("COMMIT");
  return rows.length;
}

const counts = {};
counts.apps = insertRows("apps",
  ["id", "slug", "name", "description", "partnership_tier", "brand_primary_color", "brand_background_color", "icon_url", "homepage_url", "affiliate_short_link"],
  load("apps"), (r) => { if (!r.partnership_tier) r.partnership_tier = "none"; });   // null tier => "none" (free / non-partner)
counts.categories = insertRows("categories", ["id", "slug", "name", "icon", "is_broad_category"], load("categories"));
counts.criteria = insertRows("criteria", ["id", "name", "icon"], load("criteria"));
counts.category_criteria = insertRows("category_criteria", ["id", "category_id", "criterion_id"], load("category_criteria"));
counts.category_recommendations = insertRows("category_recommendations", ["id", "app_id", "category_id", "recommendation", "classification", "best_for", "summary"], load("category_recommendations"));
counts.ratings = insertRows("ratings", ["id", "app_id", "category_id", "criterion_id", "rating", "is_applicable", "summary"], load("ratings"));
counts.comparisons = insertRows("comparisons", ["id", "slug", "name", "tldr", "is_featured", "last_published_at"], load("comparisons"));
counts.comparison_apps = insertRows("comparison_apps", ["id", "comparison_id", "app_id", "position"], load("comparison_apps"));
counts.videos = insertRows("videos", ["id", "name", "url", "duration", "date_published"], load("videos"));
counts.comparison_videos = insertRows("comparison_videos", ["id", "comparison_id", "video_id"], load("comparison_videos"));
counts.screenshots = insertRows("screenshots", ["id", "app_id", "url", "alt", "screenshot_order"], load("screenshots"));
counts.deals = insertRows("deals", ["id", "app_id", "display_name", "start_date", "end_date"], load("deals"));

db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
db.close();
console.log("Built", OUT);
console.table(counts);
