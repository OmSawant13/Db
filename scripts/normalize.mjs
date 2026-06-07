import { openDb } from "./db.mjs";

const db = openDb();

function jsonText(value) {
  return JSON.stringify(value, null, 2);
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
    ("brandPrimaryColor" in value || "brandBackgroundColor" in value || "homepageImage" in value || "glyph" in value || "icon" in value);
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
    !("brandPrimaryColor" in value);
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

function upsertAsset(asset) {
  if (!isAsset(asset)) return null;

  db.prepare(`
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
  `).run(
    asset.id || null,
    asset.url,
    asset.filename || null,
    asset.alt || null,
    asset.coveragePercent ?? null,
    asset.xOffsetPercent ?? null,
    asset.yOffsetPercent ?? null,
    jsonText(asset),
  );

  return db.prepare("SELECT id FROM assets WHERE url = ?").get(asset.url).id;
}

function upsertApp(app) {
  if (!isApp(app)) return null;

  const iconId = upsertAsset(app.icon);
  const glyphId = upsertAsset(app.glyph);
  const homepageId = upsertAsset(app.homepageImage);

  db.prepare(`
    INSERT INTO apps (
      source_id, slug, name, description, icon_asset_id, glyph_asset_id, homepage_asset_id,
      brand_background_color, brand_primary_color, brand_secondary_color, brand_tertiary_color, raw_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_id) DO UPDATE SET
      slug = excluded.slug,
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
  `).run(
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
    ? db.prepare("SELECT id FROM apps WHERE source_id = ?").get(app.id)
    : db.prepare("SELECT id FROM apps WHERE name = ? ORDER BY id LIMIT 1").get(app.name);

  if (app.deals?.docs) {
    for (const deal of app.deals.docs) upsertDeal({ ...deal, app: app.id });
  }

  return row?.id || null;
}

function upsertDeal(deal) {
  if (!isDeal(deal)) return null;

  const appSourceId = isObject(deal.app) ? deal.app.id : deal.app;
  const appId = isObject(deal.app) ? upsertApp(deal.app) : appSourceId ? db.prepare("SELECT id FROM apps WHERE source_id = ?").get(appSourceId)?.id : null;

  db.prepare(`
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
  `).run(
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

  db.prepare(`
    INSERT INTO categories (source_id, name, slug, icon, featured_order, is_broad_category, raw_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_id) DO UPDATE SET
      name = excluded.name,
      slug = excluded.slug,
      icon = excluded.icon,
      featured_order = excluded.featured_order,
      is_broad_category = excluded.is_broad_category,
      raw_json = excluded.raw_json
  `).run(
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

  db.prepare(`
    INSERT INTO stacks (source_id, slug, name, description, icon, summary_json, raw_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_id) DO UPDATE SET
      slug = excluded.slug,
      name = excluded.name,
      description = excluded.description,
      icon = excluded.icon,
      summary_json = excluded.summary_json,
      raw_json = excluded.raw_json
  `).run(
    stack.id || null,
    stack.slug || null,
    stack.name,
    stack.description || null,
    stack.icon || null,
    stack.summary ? jsonText(stack.summary) : null,
    jsonText(stack),
  );

  const stackId = db.prepare("SELECT id FROM stacks WHERE source_id = ?").get(stack.id)?.id;
  if (!stackId) return null;

  for (const item of stack.stackApps?.docs || []) {
    const appId = upsertApp(item.app);
    if (appId) {
      db.prepare("INSERT OR IGNORE INTO stack_apps (stack_id, app_id) VALUES (?, ?)").run(stackId, appId);
    }
  }

  return stackId;
}

function upsertComparison(comparison) {
  if (!isComparison(comparison)) return null;

  db.prepare(`
    INSERT INTO comparisons (source_id, name, tldr_json, raw_json)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(source_id) DO UPDATE SET
      name = excluded.name,
      tldr_json = excluded.tldr_json,
      raw_json = excluded.raw_json
  `).run(
    comparison.id || null,
    comparison.name,
    comparison.tldr ? jsonText(comparison.tldr) : null,
    jsonText(comparison),
  );

  const comparisonId = db.prepare("SELECT id FROM comparisons WHERE source_id = ?").get(comparison.id)?.id;
  if (!comparisonId) return null;

  for (const item of comparison.comparisonApps?.docs || []) {
    const appId = upsertApp(item.app);
    if (appId) {
      db.prepare("INSERT OR IGNORE INTO comparison_apps (comparison_id, app_id) VALUES (?, ?)").run(comparisonId, appId);
    }
  }

  return comparisonId;
}

function upsertCourse(course) {
  if (!isCourse(course)) return;

  const appId = upsertApp(course.app);
  db.prepare(`
    INSERT INTO courses (source_id, app_id, name, duration, module_count, raw_json)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_id) DO UPDATE SET
      app_id = excluded.app_id,
      name = excluded.name,
      duration = excluded.duration,
      module_count = excluded.module_count,
      raw_json = excluded.raw_json
  `).run(
    course.id || null,
    appId,
    course.name,
    course.duration || null,
    course.moduleCount ?? null,
    jsonText(course),
  );
}

function walk(value) {
  if (isAsset(value)) upsertAsset(value);
  if (isApp(value)) upsertApp(value);
  if (isDeal(value)) upsertDeal(value);
  if (isCategory(value)) upsertCategory(value);
  if (isStack(value)) upsertStack(value);
  if (isComparison(value)) upsertComparison(value);
  if (isCourse(value)) upsertCourse(value);

  if (Array.isArray(value)) {
    for (const item of value) walk(item);
  } else if (isObject(value)) {
    for (const item of Object.values(value)) walk(item);
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

const blocks = db.prepare("SELECT body FROM json_blocks ORDER BY id").all();
for (const block of blocks) {
  const parsed = tryJson(block.body);
  if (parsed) walk(parsed);
}

normalizeSections();

const counts = {};
for (const table of ["assets", "apps", "deals", "categories", "stacks", "comparisons", "courses", "page_sections"]) {
  counts[table] = db.prepare(`SELECT count(*) AS count FROM ${table}`).get().count;
}

console.table(counts);
db.close();
