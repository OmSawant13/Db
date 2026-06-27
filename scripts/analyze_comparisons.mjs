import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("data/efficient_clean.sqlite");

// Get all categories
const categories = db.prepare("SELECT id, name, slug FROM categories").all();

let totalCategories = categories.length;
let totalPairsNeeded = 0;
let totalPairsFound = 0;
let totalPairsMissing = 0;
let missingPairDetails = [];

let totalRatingsChecked = 0;
let missingRatingsCount = 0;
let missingRatingsDetails = [];

console.log(`Starting analysis for ${totalCategories} categories...\n`);

for (const cat of categories) {
  // 1. Get apps in this category
  const apps = db.prepare("SELECT app_id, name, slug FROM category_recommendations JOIN apps ON apps.id = app_id WHERE category_id = ?").all(cat.id);
  const appIds = apps.map(a => a.app_id);
  const n = apps.length;
  
  // Get criteria for this category
  const criteria = db.prepare("SELECT criterion_id, criteria.name FROM category_criteria JOIN criteria ON criteria.id = criterion_id WHERE category_id = ?").all(cat.id);
  
  console.log(`Category: "${cat.name}" (ID: ${cat.id}) | Apps: ${n} | Criteria: ${criteria.length}`);
  
  // 2. Check all pairings
  let catPairsNeeded = 0;
  let catPairsFound = 0;
  let catPairsMissing = 0;
  
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const appA = apps[i];
      const appB = apps[j];
      catPairsNeeded++;
      totalPairsNeeded++;
      
      // Check if a comparison exists between appA and appB
      const comp = db.prepare(`
        SELECT c.id, c.name, c.slug 
        FROM comparisons c
        JOIN comparison_apps ca1 ON ca1.comparison_id = c.id
        JOIN comparison_apps ca2 ON ca2.comparison_id = c.id
        WHERE ca1.app_id = ? AND ca2.app_id = ?
      `).get(appA.app_id, appB.app_id);
      
      if (comp) {
        catPairsFound++;
        totalPairsFound++;
      } else {
        catPairsMissing++;
        totalPairsMissing++;
        missingPairDetails.push({
          category: cat.name,
          appA: appA.name,
          appB: appB.name
        });
      }
    }
  }
  
  // 3. Check ratings completeness for each app in this category
  for (const app of apps) {
    for (const crit of criteria) {
      totalRatingsChecked++;
      const rating = db.prepare("SELECT rating, is_applicable FROM ratings WHERE app_id = ? AND category_id = ? AND criterion_id = ?").get(app.app_id, cat.id, crit.criterion_id);
      
      if (!rating) {
        missingRatingsCount++;
        missingRatingsDetails.push({
          app: app.name,
          category: cat.name,
          criterion: crit.name,
          issue: "Missing rating record entirely"
        });
      } else if (rating.rating === null && rating.is_applicable !== 0) {
        missingRatingsCount++;
        missingRatingsDetails.push({
          app: app.name,
          category: cat.name,
          criterion: crit.name,
          issue: "Rating is NULL (but marked as applicable)"
        });
      }
    }
  }
  
  console.log(`  -> Pairings: ${catPairsFound}/${catPairsNeeded} found. Missing: ${catPairsMissing}`);
}

console.log("\n================ SUMMARY OF COMPARISON PAIRINGS ================");
console.log(`Total Categories Analyzed           : ${totalCategories}`);
console.log(`Total Pairs (Matchups) Needed       : ${totalPairsNeeded}`);
console.log(`Total Pairs (Matchups) Found        : ${totalPairsFound}`);
console.log(`Total Pairs (Matchups) Missing      : ${totalPairsMissing}`);
console.log(`Completeness of Matchups            : ${((totalPairsFound / totalPairsNeeded) * 100).toFixed(2)}%`);

console.log("\n================ SUMMARY OF RATING SCORES ================");
console.log(`Total Ratings Checked (App-Criteria) : ${totalRatingsChecked}`);
console.log(`Total Missing/Null Ratings           : ${missingRatingsCount}`);
console.log(`Completeness of Ratings              : ${(((totalRatingsChecked - missingRatingsCount) / totalRatingsChecked) * 100).toFixed(2)}%`);

if (missingPairDetails.length > 0) {
  console.log("\n--- Sample of Missing Comparisons (First 15) ---");
  console.table(missingPairDetails.slice(0, 15));
}

if (missingRatingsDetails.length > 0) {
  console.log("\n--- Sample of Missing/Null Ratings (First 15) ---");
  console.table(missingRatingsDetails.slice(0, 15));
}

db.close();
