// Apply our own genuine content (data/generated.json) into a DB for the fields
// efficient.app left blank. Tags everything with source='ours'. Enforces
// consistency: the same (app, criterion) must get the same score everywhere.
//
//   node scripts/apply_generated.mjs [dbPath]   (default: data/efficient_clean.sqlite)

import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const DB = process.argv[2] || "data/efficient_clean.sqlite";
const genFile = JSON.parse(readFileSync("data/generated.json", "utf8"));
const gen = genFile.content;
const catCritDefs = genFile.category_criteria || {};
const db = new DatabaseSync(DB);

// add source columns (idempotent)
const hasCol = (t, c) => db.prepare(`PRAGMA table_info(${t})`).all().some((x) => x.name === c);
if (!hasCol("category_recommendations", "source")) db.exec("ALTER TABLE category_recommendations ADD COLUMN source TEXT DEFAULT 'efficient'");
if (!hasCol("ratings", "source")) db.exec("ALTER TABLE ratings ADD COLUMN source TEXT DEFAULT 'efficient'");

const lex = (text) => JSON.stringify({ root: { type: "root", format: "", indent: 0, version: 1, children: [{ type: "paragraph", format: "", indent: 0, version: 1, children: [{ mode: "normal", text, type: "text", style: "", detail: 0, format: 0, version: 1 }] }] } });

let nextRatingId = (db.prepare("SELECT max(id) m FROM ratings").get().m || 0) + 1;
if (nextRatingId < 1000000) nextRatingId = 1000000; // keep ours in a distinct id range

const appByName = (n) => db.prepare("SELECT id FROM apps WHERE name=?").get(n);
const catByName = (n) => db.prepare("SELECT id FROM categories WHERE name=?").get(n);

// ---- define our own criteria for categories efficient left without any ----
let nextCritId = Math.max((db.prepare("SELECT max(id) m FROM criteria").get().m || 0) + 1, 10000);
let nextCcId = Math.max((db.prepare("SELECT max(id) m FROM category_criteria").get().m || 0) + 1, 10000);
let critDefW = 0;
for (const [catName, critNames] of Object.entries(catCritDefs)) {
  const cat = catByName(catName);
  if (!cat) continue;
  for (const critName of critNames) {
    let crit = db.prepare("SELECT id FROM criteria WHERE name=?").get(critName);
    if (!crit) { db.prepare("INSERT INTO criteria (id,name,icon) VALUES (?,?,NULL)").run(nextCritId, critName); crit = { id: nextCritId++ }; }
    const linked = db.prepare("SELECT id FROM category_criteria WHERE category_id=? AND criterion_id=?").get(cat.id, crit.id);
    if (!linked) { db.prepare("INSERT INTO category_criteria (id,category_id,criterion_id) VALUES (?,?,?)").run(nextCcId++, cat.id, crit.id); critDefW++; }
  }
}
const consistency = new Map(); // `${appId}:${critId}` -> score  (across categories)
let recsW = 0, ratingsW = 0, warns = [];

for (const item of gen) {
  const app = appByName(item.app), cat = catByName(item.category);
  if (!app || !cat) { warns.push(`skip: ${item.app} / ${item.category} not found`); continue; }

  // update category_recommendation (only fill blanks; don't overwrite efficient's)
  const rec = db.prepare("SELECT id, best_for, summary FROM category_recommendations WHERE app_id=? AND category_id=?").get(app.id, cat.id);
  if (rec) {
    db.prepare("UPDATE category_recommendations SET best_for=CASE WHEN best_for IS NULL OR best_for='' THEN ? ELSE best_for END, summary=CASE WHEN summary IS NULL OR summary='' THEN ? ELSE summary END, source=CASE WHEN (best_for IS NULL OR best_for='') AND (summary IS NULL OR summary='') THEN 'ours' ELSE source END WHERE id=?")
      .run(item.best_for ?? null, item.summary ? lex(item.summary) : null, rec.id);
    recsW++;
  }

  // ratings per criterion — value is either `score` or `[score, verdict]`
  for (const [critName, val] of Object.entries(item.ratings || {})) {
    const score = Array.isArray(val) ? val[0] : val;
    const verdict = Array.isArray(val) ? (val[1] ?? null) : null;
    const crit = db.prepare(`SELECT cr.id FROM category_criteria cc JOIN criteria cr ON cr.id=cc.criterion_id WHERE cc.category_id=? AND cr.name=?`).get(cat.id, critName)
      || db.prepare("SELECT id FROM criteria WHERE name=?").get(critName);
    if (!crit) { warns.push(`no criterion '${critName}' in ${item.category}`); continue; }
    // consistency: same (app, criterion) -> same score
    const key = `${app.id}:${crit.id}`;
    if (consistency.has(key) && consistency.get(key) !== score) warns.push(`INCONSISTENT: ${item.app} '${critName}' = ${score} vs ${consistency.get(key)} elsewhere`);
    consistency.set(key, score);
    // also check against efficient's existing score for this (app,criterion) in any category
    const eff = db.prepare("SELECT rating FROM ratings WHERE app_id=? AND criterion_id=? AND source='efficient' AND rating IS NOT NULL LIMIT 1").get(app.id, crit.id);
    if (eff && eff.rating !== score) warns.push(`CLASH with efficient: ${item.app} '${critName}' ours=${score} efficient=${eff.rating}`);

    const sum = verdict ? lex(verdict) : null;
    const exists = db.prepare("SELECT id, source FROM ratings WHERE app_id=? AND category_id=? AND criterion_id=?").get(app.id, cat.id, crit.id);
    if (exists) {
      if (exists.source !== "efficient") {
        // overwrite OUR own rows fully (rating + verdict)
        db.prepare("UPDATE ratings SET rating=?, is_applicable=1, summary=COALESCE(?, summary), source='ours' WHERE id=?").run(score, sum, exists.id);
      } else if (sum) {
        // fill efficient's MISSING verdict only — never change its score (requires our score to match efficient's)
        const cur = db.prepare("SELECT rating, summary FROM ratings WHERE id=?").get(exists.id);
        if ((cur.summary === null || cur.summary === "") && cur.rating === score) db.prepare("UPDATE ratings SET summary=? WHERE id=?").run(sum, exists.id);
      }
    } else { db.prepare("INSERT INTO ratings (id,app_id,category_id,criterion_id,rating,is_applicable,summary,source) VALUES (?,?,?,?,?,1,?,'ours')").run(nextRatingId++, app.id, cat.id, crit.id, score, sum); ratingsW++; }
  }
}

console.log(`Applied to ${DB}`);
console.log(`  category_criteria defined (ours): ${critDefW}`);
console.log(`  category_recommendations updated: ${recsW}`);
console.log(`  ratings inserted (ours): ${ratingsW}`);
if (warns.length) { console.log("  ⚠️ warnings:"); warns.forEach((w) => console.log("     - " + w)); }
else console.log("  ✅ no consistency clashes");
db.close();
