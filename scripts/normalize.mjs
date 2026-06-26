import { openDb } from "./db.mjs";

const db = openDb();

// --- PREPARED STATEMENTS ---
const stmtInsertCriterion = db.prepare(`
  INSERT INTO criteria (source_id, name, icon)
  VALUES (?, ?, ?)
  ON CONFLICT(source_id) DO UPDATE SET
    name = excluded.name,
    icon = excluded.icon
`);
const stmtGetCriterionId = db.prepare("SELECT id FROM criteria WHERE source_id = ?");

const stmtGetCategoryId = db.prepare("SELECT id FROM categories WHERE source_id = ?");
const stmtInsertCategoryCriterion = db.prepare(`
  INSERT INTO category_criteria (source_id, category_id, criterion_id, category_criterion_name, description, order_num)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(source_id) DO UPDATE SET
    category_id = COALESCE(excluded.category_id, category_criteria.category_id),
    criterion_id = COALESCE(excluded.criterion_id, category_criteria.criterion_id),
    category_criterion_name = excluded.category_criterion_name,
    description = excluded.description,
    order_num = excluded.order_num
`);
const stmtGetCategoryCriterionId = db.prepare("SELECT id FROM category_criteria WHERE source_id = ?");

const stmtGetAppId = db.prepare("SELECT id FROM apps WHERE source_id = ?");
const stmtInsertReview = db.prepare(`
  INSERT INTO reviews (source_id, app_id, category_id, recommendation, classification, best_for, last_published_at, last_isr_date, raw_json)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(source_id) DO UPDATE SET
    app_id = COALESCE(excluded.app_id, reviews.app_id),
    category_id = COALESCE(excluded.category_id, reviews.category_id),
    recommendation = excluded.recommendation,
    classification = excluded.classification,
    best_for = excluded.best_for,
    last_published_at = excluded.last_published_at,
    last_isr_date = excluded.last_isr_date,
    raw_json = excluded.raw_json
`);
const stmtGetReviewId = db.prepare("SELECT id FROM reviews WHERE source_id = ?");

const stmtInsertReviewRating = db.prepare(`
  INSERT INTO review_ratings (source_id, review_id, category_criterion_id, is_applicable, rating)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(source_id) DO UPDATE SET
    review_id = COALESCE(excluded.review_id, review_ratings.review_id),
    category_criterion_id = COALESCE(excluded.category_criterion_id, review_ratings.category_criterion_id),
    is_applicable = excluded.is_applicable,
    rating = excluded.rating
`);

const stmtInsertAsset = db.prepare(`
  INSERT INTO assets (source_id, url, filename, alt, coverage_percent, x_offset_percent, y_offset_percent, raw_json)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(url) DO UPDATE SET
    source_id = COALESCE(excluded.source_id, assets.source_id),
    filename = excluded.filename,
    alt = excluded.alt,
    coverage_percent = excluded.coverage_percent,
    x_offset_percent = excluded.x_offset_percent,
    y_offset_percent = excluded.y_offset_percent,
    raw_json = excluded.raw_json
`);
const stmtGetAssetId = db.prepare("SELECT id FROM assets WHERE url = ?");

const stmtInsertApp = db.prepare(`
  INSERT INTO apps (
    source_id, slug, name, description, icon_asset_id, glyph_asset_id, homepage_asset_id,
    brand_background_color, brand_primary_color, brand_secondary_color, brand_tertiary_color, raw_json
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(source_id) DO UPDATE SET
    slug = COALESCE(excluded.slug, apps.slug),
    name = excluded.name,
    description = COALESCE(excluded.description, apps.description),
    icon_asset_id = COALESCE(excluded.icon_asset_id, apps.icon_asset_id),
    glyph_asset_id = COALESCE(excluded.glyph_asset_id, apps.glyph_asset_id),
    homepage_asset_id = COALESCE(excluded.homepage_asset_id, apps.homepage_asset_id),
    brand_background_color = COALESCE(excluded.brand_background_color, apps.brand_background_color),
    brand_primary_color = COALESCE(excluded.brand_primary_color, apps.brand_primary_color),
    brand_secondary_color = COALESCE(excluded.brand_secondary_color, apps.brand_secondary_color),
    brand_tertiary_color = COALESCE(excluded.brand_tertiary_color, apps.brand_tertiary_color),
    raw_json = excluded.raw_json
`);
const stmtGetAppByName = db.prepare("SELECT id FROM apps WHERE name = ? ORDER BY id LIMIT 1");

const stmtInsertDeal = db.prepare(`
  INSERT INTO deals (
    source_id, app_source_id, app_id, name, display_name, unit_type, quantity, duration_days,
    value, promo_code, terms, claimed, eligibility, is_featured, is_reward, start_date, end_date, raw_json
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(source_id) DO UPDATE SET
    app_source_id = excluded.app_source_id,
    app_id = COALESCE(excluded.app_id, deals.app_id),
    name = excluded.name,
    display_name = excluded.display_name,
    unit_type = excluded.unit_type,
    quantity = excluded.quantity,
    duration_days = excluded.duration_days,
    value = excluded.value,
    promo_code = excluded.promo_code,
    terms = excluded.terms,
    claimed = excluded.claimed,
    eligibility = excluded.eligibility,
    is_featured = excluded.is_featured,
    is_reward = excluded.is_reward,
    start_date = excluded.start_date,
    end_date = excluded.end_date,
    raw_json = excluded.raw_json
`);

const stmtInsertCategory = db.prepare(`
  INSERT INTO categories (source_id, name, slug, icon, featured_order, is_broad_category, raw_json)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(source_id) DO UPDATE SET
    name = excluded.name,
    slug = excluded.slug,
    icon = excluded.icon,
    featured_order = excluded.featured_order,
    is_broad_category = excluded.is_broad_category,
    raw_json = excluded.raw_json
`);

const stmtInsertStack = db.prepare(`
  INSERT INTO stacks (source_id, slug, name, description, icon, summary_json, raw_json)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(source_id) DO UPDATE SET
    slug = excluded.slug,
    name = excluded.name,
    description = excluded.description,
    icon = excluded.icon,
    summary_json = excluded.summary_json,
    raw_json = excluded.raw_json
`);
const stmtGetStackId = db.prepare("SELECT id FROM stacks WHERE source_id = ?");
const stmtInsertStackApp = db.prepare("INSERT OR IGNORE INTO stack_apps (stack_id, app_id) VALUES (?, ?)");

const stmtInsertComparison = db.prepare(`
  INSERT INTO comparisons (source_id, name, tldr_json, raw_json)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(source_id) DO UPDATE SET
    name = excluded.name,
    tldr_json = excluded.tldr_json,
    raw_json = excluded.raw_json
`);
const stmtGetComparisonId = db.prepare("SELECT id FROM comparisons WHERE source_id = ?");
const stmtInsertComparisonApp = db.prepare("INSERT OR IGNORE INTO comparison_apps (comparison_id, app_id) VALUES (?, ?)");

const stmtInsertCourse = db.prepare(`
  INSERT INTO courses (source_id, app_id, name, duration, module_count, raw_json)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(source_id) DO UPDATE SET
    app_id = excluded.app_id,
    name = excluded.name,
    duration = excluded.duration,
    module_count = excluded.module_count,
    raw_json = excluded.raw_json
`);

const junctionAppToApp = new Map();
const pendingComparisons = [];
const pendingStacks = [];

function jsonText(value) {
  return JSON.stringify(value);
}

function tryJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function isAsset(value) {
  return isObject(value) && typeof value.url === "string" && typeof value.filename === "string";
}

function isApp(value) {
  return isObject(value) &&
    typeof value.name === "string" &&
    (
      "brandPrimaryColor" in value ||
      "brandBackgroundColor" in value ||
      "homepageImage" in value ||
      "glyph" in value ||
      (typeof value.icon === "string" && value.icon.startsWith("$")) ||
      isObject(value.icon) ||
      "partnershipTier" in value
    );
}

function isDeal(value) {
  return isObject(value) &&
    typeof value.name === "string" &&
    ("unitType" in value || "promoCode" in value || "claimed" in value || "displayName" in value) &&
    ("value" in value || "durationDays" in value || "quantity" in value);
}

function isCategory(value) {
  return isObject(value) &&
    typeof value.name === "string" &&
    typeof value.slug === "string" &&
    typeof value.icon === "string" &&
    !value.icon.startsWith("$") &&
    !("brandPrimaryColor" in value) &&
    !("brandBackgroundColor" in value) &&
    !("partnershipTier" in value);
}

function isStack(value) {
  return isObject(value) &&
    typeof value.name === "string" &&
    "stackApps" in value &&
    ("summary" in value || "description" in value);
}

function isComparison(value) {
  return isObject(value) &&
    typeof value.name === "string" &&
    "comparisonApps" in value;
}

function isCourse(value) {
  return isObject(value) &&
    typeof value.name === "string" &&
    "duration" in value &&
    "moduleCount" in value &&
    "app" in value;
}

function isReview(value) {
  return isObject(value) &&
    typeof value.id === "number" &&
    "reviewCategoryCriterionRating" in value;
}

function isCategoryRecommendation(value) {
  return isObject(value) &&
    typeof value.id === "number" &&
    "recommendation" in value &&
    "classification" in value &&
    !("brandPrimaryColor" in value);
}

function upsertCriterion(criterion) {
  if (!criterion) return null;
  const c = isObject(criterion) ? criterion : { id: criterion };
  if (!c.name) return c.id;

  stmtInsertCriterion.run(c.id, c.name, c.icon || null);
  
  return c.id;
}

function upsertCategoryCriterion(cc, defaultCatId) {
  if (!cc) return null;
  const ccObj = isObject(cc) ? cc : { id: cc };
  
  const catSourceId = isObject(ccObj.category) ? ccObj.category.id : ccObj.category;
  const catId = (catSourceId 
    ? (stmtGetCategoryId.get(catSourceId)?.id || null) 
    : defaultCatId) ?? null;
    
  let critId = null;
  if (ccObj.criterion) {
    const critSourceId = upsertCriterion(ccObj.criterion);
    critId = (critSourceId ? (stmtGetCriterionId.get(critSourceId)?.id || null) : null) ?? null;
  }

  stmtInsertCategoryCriterion.run(
    ccObj.id,
    catId,
    critId,
    ccObj.categoryCriterionName || null,
    ccObj.description || null,
    ccObj.order ?? null
  );

  return ccObj.id;
}

function upsertReview(review, appId, catId) {
  if (!review) return null;
  const revObj = review;
  
  let finalAppId = appId ?? null;
  if (!finalAppId && revObj.app) {
    const appSourceId = isObject(revObj.app) ? revObj.app.id : revObj.app;
    finalAppId = stmtGetAppId.get(appSourceId)?.id || null;
  }
  finalAppId = finalAppId ?? null;
  
  let finalCatId = catId ?? null;
  if (!finalCatId && revObj.category) {
    const catSourceId = isObject(revObj.category) ? revObj.category.id : revObj.category;
    finalCatId = stmtGetCategoryId.get(catSourceId)?.id || null;
  }
  finalCatId = finalCatId ?? null;

  stmtInsertReview.run(
    revObj.id,
    finalAppId,
    finalCatId,
    revObj.recommendation || null,
    revObj.classification || null,
    revObj.bestFor || null,
    revObj.lastPublishedAt || null,
    revObj.lastIsrDate || null,
    jsonText(revObj)
  );

  return stmtGetReviewId.get(revObj.id)?.id || null;
}

function upsertReviewRating(rating, reviewId, catId) {
  if (!rating) return null;
  
  let ccSourceId = null;
  const targetCatId = catId ?? null;
  if (typeof rating.categoryCriterion === "string" && rating.categoryCriterion.startsWith("$")) {
    const parts = rating.categoryCriterion.split(":");
    const docsIdx = parts.indexOf("categoryCriteria");
    if (docsIdx !== -1 && parts[docsIdx + 1] === "docs" && targetCatId !== null) {
      const index = parseInt(parts[docsIdx + 2], 10);
      if (!isNaN(index)) {
        const criteriaList = db.prepare("SELECT source_id FROM category_criteria WHERE category_id = ? ORDER BY order_num ASC, id ASC").all(targetCatId);
        if (criteriaList[index]) {
          ccSourceId = criteriaList[index].source_id;
        }
      }
    }
  } else if (rating.categoryCriterion) {
    ccSourceId = upsertCategoryCriterion(rating.categoryCriterion, targetCatId);
  }

  const ccId = ccSourceId 
    ? stmtGetCategoryCriterionId.get(ccSourceId)?.id 
    : null;

  stmtInsertReviewRating.run(
    rating.id,
    reviewId ?? null,
    ccId ?? null,
    rating.isApplicable ? 1 : 0,
    rating.rating ?? null
  );
}

function upsertAsset(asset) {
  if (!isAsset(asset)) return null;

  stmtInsertAsset.run(
    asset.id || null,
    asset.url,
    asset.filename || null,
    asset.alt || null,
    asset.coveragePercent ?? null,
    asset.xOffsetPercent ?? null,
    asset.yOffsetPercent ?? null,
    jsonText(asset),
  );

  return stmtGetAssetId.get(asset.url).id;
}

function upsertApp(app) {
  if (!isApp(app)) return null;

  const iconId = upsertAsset(app.icon);
  const glyphId = upsertAsset(app.glyph);
  const homepageId = upsertAsset(app.homepageImage);

  stmtInsertApp.run(
    app.id || null,
    app.slug || null,
    app.name,
    app.description || null,
    iconId,
    glyphId,
    homepageId,
    app.brandBackgroundColor || null,
    app.brandPrimaryColor || null,
    app.brandSecondaryColor || null,
    app.brandTertiaryColor || null,
    jsonText(app),
  );

  const row = app.id
    ? stmtGetAppId.get(app.id)
    : stmtGetAppByName.get(app.name);

  if (app.deals?.docs) {
    for (const deal of app.deals.docs) upsertDeal({ ...deal, app: app.id });
  }

  return row?.id || null;
}

function upsertDeal(deal) {
  if (!isDeal(deal)) return null;

  const appSourceId = isObject(deal.app) ? deal.app.id : deal.app;
  const appId = isObject(deal.app) 
    ? upsertApp(deal.app) 
    : appSourceId ? (stmtGetAppId.get(appSourceId)?.id || null) : null;

  stmtInsertDeal.run(
    deal.id || null,
    appSourceId || null,
    appId || null,
    deal.name || null,
    deal.displayName || null,
    deal.unitType || null,
    deal.quantity ?? null,
    deal.durationDays ?? null,
    deal.value ?? null,
    deal.promoCode || null,
    deal.terms || null,
    deal.claimed ?? null,
    deal.eligibility || null,
    deal.isFeatured ? 1 : 0,
    deal.isReward ? 1 : 0,
    deal.startDate || null,
    deal.endDate || null,
    jsonText(deal),
  );
}

function upsertCategory(category) {
  if (!isCategory(category)) return;

  stmtInsertCategory.run(
    category.id || null,
    category.name,
    category.slug,
    category.icon,
    category.featuredOrder ?? null,
    category.isBroadCategory ? 1 : 0,
    jsonText(category),
  );
}

function upsertStack(stack) {
  if (!isStack(stack)) return null;

  stmtInsertStack.run(
    stack.id || null,
    stack.slug || null,
    stack.name,
    stack.description || null,
    stack.icon || null,
    stack.summary ? jsonText(stack.summary) : null,
    jsonText(stack),
  );

  const stackId = stmtGetStackId.get(stack.id)?.id;
  if (!stackId) return null;

  for (const item of stack.stackApps?.docs || []) {
    let appId = null;
    if (isObject(item)) {
      const appSourceId = isObject(item.app) ? item.app.id : item.app;
      appId = appSourceId ? (stmtGetAppId.get(appSourceId)?.id || null) : null;
    } else if (typeof item === "number") {
      appId = junctionAppToApp.get(item);
    }
    if (appId) {
      stmtInsertStackApp.run(stackId, appId);
    }
  }

  return stackId;
}

function upsertComparison(comparison) {
  if (!isComparison(comparison)) return null;

  stmtInsertComparison.run(
    comparison.id || null,
    comparison.name,
    comparison.tldr ? jsonText(comparison.tldr) : null,
    jsonText(comparison),
  );

  const comparisonId = stmtGetComparisonId.get(comparison.id)?.id;
  if (!comparisonId) return null;

  for (const item of comparison.comparisonApps?.docs || []) {
    let appId = null;
    if (isObject(item)) {
      const appSourceId = isObject(item.app) ? item.app.id : item.app;
      appId = appSourceId ? (stmtGetAppId.get(appSourceId)?.id || null) : null;
    } else if (typeof item === "number") {
      appId = junctionAppToApp.get(item);
    }
    if (appId) {
      stmtInsertComparisonApp.run(comparisonId, appId);
    }
  }

  return comparisonId;
}

function upsertCourse(course) {
  if (!isCourse(course)) return;

  const appId = upsertApp(course.app);
  stmtInsertCourse.run(
    course.id || null,
    appId,
    course.name,
    course.duration || null,
    course.moduleCount ?? null,
    jsonText(course),
  );
}

function walk(value, context = {}) {
  if (!value) return;

  if (isAsset(value)) upsertAsset(value);
  
  let newCtx = context;
  if (isApp(value)) {
    const appId = upsertApp(value);
    newCtx = { ...context, appId };
    if (value.categoryRecommendations?.docs) {
      for (let i = 0; i < value.categoryRecommendations.docs.length; i++) {
        walk(value.categoryRecommendations.docs[i], newCtx);
      }
    }
  }
  
  if (isDeal(value)) upsertDeal(value);
  
  if (isCategory(value)) {
    upsertCategory(value);
    const catId = stmtGetCategoryId.get(value.id)?.id;
    newCtx = { ...context, categoryId: catId };
    if (value.categoryCriteria?.docs) {
      for (let i = 0; i < value.categoryCriteria.docs.length; i++) {
        upsertCategoryCriterion(value.categoryCriteria.docs[i], catId);
      }
    }
  }
  
  if (isCourse(value)) upsertCourse(value);

  if (isReview(value)) {
    const reviewId = upsertReview(value, newCtx.appId, newCtx.categoryId);
    let catId = newCtx.categoryId ?? null;
    if (!catId && reviewId) {
      const row = db.prepare("SELECT category_id FROM reviews WHERE id = ?").get(reviewId);
      if (row) catId = row.category_id;
    }
    if (value.reviewCategoryCriterionRating?.docs) {
      for (let i = 0; i < value.reviewCategoryCriterionRating.docs.length; i++) {
        upsertReviewRating(value.reviewCategoryCriterionRating.docs[i], reviewId, catId);
      }
    }
  }

  if (isCategoryRecommendation(value)) {
    const appVal = value.app;
    const catVal = value.category;
    const appSourceId = isObject(appVal) ? appVal.id : appVal;
    const catSourceId = isObject(catVal) ? catVal.id : catVal;

    const appId = isObject(appVal) 
      ? upsertApp(appVal) 
      : (appSourceId ? (stmtGetAppId.get(appSourceId)?.id || null) : newCtx.appId);
      
    const catId = isObject(catVal) 
      ? (upsertCategory(catVal) || stmtGetCategoryId.get(catVal.id)?.id) 
      : (catSourceId ? (stmtGetCategoryId.get(catSourceId)?.id || null) : newCtx.categoryId);

    const reviewId = upsertReview(value, appId, catId);
    let finalCatId = catId ?? null;
    if (!finalCatId && reviewId) {
      const row = db.prepare("SELECT category_id FROM reviews WHERE id = ?").get(reviewId);
      if (row) finalCatId = row.category_id;
    }
    if (value.reviewCategoryCriterionRating?.docs) {
      for (let i = 0; i < value.reviewCategoryCriterionRating.docs.length; i++) {
        upsertReviewRating(value.reviewCategoryCriterionRating.docs[i], reviewId, finalCatId);
      }
    }
  }

  if (isObject(value) && typeof value.id === "number" && isObject(value.app) && typeof value.app.name === "string") {
    const appId = upsertApp(value.app);
    if (appId) {
      junctionAppToApp.set(value.id, appId);
    }
  }

  if (isComparison(value)) {
    pendingComparisons.push({
      id: value.id,
      name: value.name,
      tldr: value.tldr,
      comparisonApps: {
        docs: (value.comparisonApps?.docs || []).map(doc => {
          if (isObject(doc)) {
            return { id: doc.id, app: doc.app ? { id: doc.app.id, name: doc.app.name, slug: doc.app.slug } : null };
          }
          return doc; // number
        })
      }
    });
  }
  if (isStack(value)) {
    pendingStacks.push({
      id: value.id,
      slug: value.slug,
      name: value.name,
      description: value.description,
      icon: value.icon,
      summary: value.summary,
      stackApps: {
        docs: (value.stackApps?.docs || []).map(doc => {
          if (isObject(doc)) {
            return { id: doc.id, app: doc.app ? { id: doc.app.id, name: doc.app.name, slug: doc.app.slug } : null };
          }
          return doc; // number
        })
      }
    });
  }

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      walk(value[i], newCtx);
    }
  } else if (isObject(value)) {
    for (const key in value) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        if (key === "html" || key === "text" || key === "css" || key === "style" || key === "className" || key === "rawHtml") {
          continue;
        }
        walk(value[key], newCtx);
      }
    }
  }
}

function normalizeSections() {
  db.prepare("DELETE FROM page_sections").run();
  const pages = db.prepare("SELECT id, text FROM pages ORDER BY id").all();
  const insert = db.prepare(`
    INSERT INTO page_sections (page_id, section_order, heading, body, raw_text)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const page of pages) {
    const lines = page.text
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);

    let order = 0;
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const next = lines.slice(i + 1, i + 5).join("\n");

      if (line.length <= 90 && /[A-Za-z]/.test(line)) {
        insert.run(page.id, order, line, next, [line, next].filter(Boolean).join("\n"));
        order += 1;
      }
    }
  }
}

function clearNormalized() {
  for (const table of [
    "review_ratings",
    "reviews",
    "category_criteria",
    "criteria",
    "stack_apps",
    "comparison_apps",
    "courses",
    "comparisons",
    "stacks",
    "deals",
    "categories",
    "apps",
    "assets",
  ]) {
    db.prepare(`DELETE FROM ${table}`).run();
  }
}

clearNormalized();

function parseAndWalk(body) {
  // Fast string-based keyword filter to skip non-data payloads (stylesheets, chunks, telemetry, etc.)
  if (!body.includes('"name"') && 
      !body.includes('"slug"') && 
      !body.includes('"recommendation"') && 
      !body.includes('"reviewCategoryCriterionRating"')) {
    return;
  }

  const trimmed = body.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      walk(parsed);
    } catch {}
    return;
  }

  const lines = body.split("\n");
  for (const line of lines) {
    const startIdx = Math.min(
      line.indexOf("{") === -1 ? Infinity : line.indexOf("{"),
      line.indexOf("[") === -1 ? Infinity : line.indexOf("[")
    );
    if (startIdx !== Infinity) {
      const jsonStr = line.slice(startIdx);
      try {
        const obj = JSON.parse(jsonStr);
        walk(obj);
      } catch {}
    }
  }
}

db.exec("BEGIN TRANSACTION");
try {
  const blocksIter = db.prepare("SELECT body FROM json_blocks ORDER BY id").iterate();
  let count = 0;
  for (const block of blocksIter) {
    parseAndWalk(block.body);
    count++;
    if (count % 10000 === 0) {
      console.log(`Processed ${count} json_blocks...`);
    }
    if (count % 2000 === 0) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  for (const comp of pendingComparisons) {
    upsertComparison(comp);
  }
  for (const stack of pendingStacks) {
    upsertStack(stack);
  }
  db.exec("COMMIT");
  console.log("Committed main normalization transaction.");
} catch (err) {
  db.exec("ROLLBACK");
  console.error("Error in main normalization transaction:", err);
  throw err;
}

db.exec("BEGIN TRANSACTION");
try {
  normalizeSections();
  db.exec("COMMIT");
  console.log("Committed section normalization transaction.");
} catch (err) {
  db.exec("ROLLBACK");
  console.error("Error in section normalization transaction:", err);
  throw err;
}

const counts = {};
for (const table of [
  "assets",
  "apps",
  "deals",
  "categories",
  "stacks",
  "comparisons",
  "courses",
  "page_sections",
  "criteria",
  "category_criteria",
  "reviews",
  "review_ratings"
]) {
  counts[table] = db.prepare(`SELECT count(*) AS count FROM ${table}`).get().count;
}

console.table(counts);
db.close();
