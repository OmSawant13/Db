import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export const DB_PATH = process.env.DB_PATH || "data/efficient.db";

export function openDb() {
  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL UNIQUE,
      status INTEGER,
      title TEXT,
      text TEXT,
      html TEXT,
      crawled_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_id INTEGER NOT NULL,
      href TEXT NOT NULL,
      text TEXT,
      FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS json_blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      source_url TEXT,
      status INTEGER,
      content_type TEXT,
      body TEXT NOT NULL,
      FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_links_page_id ON links(page_id);
    CREATE INDEX IF NOT EXISTS idx_json_blocks_page_id ON json_blocks(page_id);
    CREATE INDEX IF NOT EXISTS idx_json_blocks_kind ON json_blocks(kind);

    CREATE TABLE IF NOT EXISTS assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER,
      url TEXT NOT NULL UNIQUE,
      filename TEXT,
      alt TEXT,
      coverage_percent REAL,
      x_offset_percent REAL,
      y_offset_percent REAL,
      raw_json TEXT
    );

    CREATE TABLE IF NOT EXISTS apps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER UNIQUE,
      slug TEXT,
      name TEXT NOT NULL,
      description TEXT,
      icon_asset_id INTEGER,
      glyph_asset_id INTEGER,
      homepage_asset_id INTEGER,
      brand_background_color TEXT,
      brand_primary_color TEXT,
      brand_secondary_color TEXT,
      brand_tertiary_color TEXT,
      raw_json TEXT,
      FOREIGN KEY (icon_asset_id) REFERENCES assets(id),
      FOREIGN KEY (glyph_asset_id) REFERENCES assets(id),
      FOREIGN KEY (homepage_asset_id) REFERENCES assets(id)
    );

    CREATE TABLE IF NOT EXISTS deals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER UNIQUE,
      app_source_id INTEGER,
      app_id INTEGER,
      name TEXT,
      display_name TEXT,
      unit_type TEXT,
      quantity REAL,
      duration_days INTEGER,
      value REAL,
      promo_code TEXT,
      terms TEXT,
      claimed INTEGER,
      eligibility TEXT,
      is_featured INTEGER,
      is_reward INTEGER,
      start_date TEXT,
      end_date TEXT,
      raw_json TEXT,
      FOREIGN KEY (app_id) REFERENCES apps(id)
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER UNIQUE,
      name TEXT NOT NULL,
      slug TEXT,
      icon TEXT,
      featured_order INTEGER,
      is_broad_category INTEGER,
      raw_json TEXT
    );

    CREATE TABLE IF NOT EXISTS stacks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER UNIQUE,
      slug TEXT,
      name TEXT NOT NULL,
      description TEXT,
      icon TEXT,
      summary_json TEXT,
      raw_json TEXT
    );

    CREATE TABLE IF NOT EXISTS stack_apps (
      stack_id INTEGER NOT NULL,
      app_id INTEGER NOT NULL,
      PRIMARY KEY (stack_id, app_id),
      FOREIGN KEY (stack_id) REFERENCES stacks(id) ON DELETE CASCADE,
      FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS comparisons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER UNIQUE,
      name TEXT NOT NULL,
      tldr_json TEXT,
      raw_json TEXT
    );

    CREATE TABLE IF NOT EXISTS comparison_apps (
      comparison_id INTEGER NOT NULL,
      app_id INTEGER NOT NULL,
      PRIMARY KEY (comparison_id, app_id),
      FOREIGN KEY (comparison_id) REFERENCES comparisons(id) ON DELETE CASCADE,
      FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER UNIQUE,
      app_id INTEGER,
      name TEXT NOT NULL,
      duration TEXT,
      module_count INTEGER,
      raw_json TEXT,
      FOREIGN KEY (app_id) REFERENCES apps(id)
    );

    CREATE TABLE IF NOT EXISTS page_sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_id INTEGER NOT NULL,
      section_order INTEGER NOT NULL,
      heading TEXT,
      body TEXT,
      raw_text TEXT,
      FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS criteria (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER UNIQUE,
      name TEXT NOT NULL,
      icon TEXT
    );

    CREATE TABLE IF NOT EXISTS category_criteria (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER UNIQUE,
      category_id INTEGER,
      criterion_id INTEGER,
      category_criterion_name TEXT,
      description TEXT,
      order_num INTEGER,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
      FOREIGN KEY (criterion_id) REFERENCES criteria(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER UNIQUE,
      app_id INTEGER,
      category_id INTEGER,
      recommendation TEXT,
      classification TEXT,
      best_for TEXT,
      last_published_at TEXT,
      last_isr_date TEXT,
      raw_json TEXT,
      FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS review_ratings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER UNIQUE,
      review_id INTEGER,
      category_criterion_id INTEGER,
      is_applicable INTEGER,
      rating INTEGER,
      FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
      FOREIGN KEY (category_criterion_id) REFERENCES category_criteria(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_apps_slug ON apps(slug);
    CREATE INDEX IF NOT EXISTS idx_deals_app_id ON deals(app_id);
    CREATE INDEX IF NOT EXISTS idx_page_sections_page_id ON page_sections(page_id);
    CREATE INDEX IF NOT EXISTS idx_category_criteria_category_id ON category_criteria(category_id);
    CREATE INDEX IF NOT EXISTS idx_reviews_app_id ON reviews(app_id);
    CREATE INDEX IF NOT EXISTS idx_reviews_category_id ON reviews(category_id);
    CREATE INDEX IF NOT EXISTS idx_review_ratings_review_id ON review_ratings(review_id);
  `);
  return db;
}

export function upsertPage(db, page) {
  db.prepare(`
    INSERT INTO pages (url, status, title, text, html, crawled_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(url) DO UPDATE SET
      status = excluded.status,
      title = excluded.title,
      text = excluded.text,
      html = excluded.html,
      crawled_at = excluded.crawled_at
  `).run(page.url, page.status, page.title, page.text, page.html, page.crawledAt);

  return db.prepare("SELECT id FROM pages WHERE url = ?").get(page.url).id;
}

export function replacePageDetails(db, pageId, links, jsonBlocks) {
  db.prepare("DELETE FROM links WHERE page_id = ?").run(pageId);
  db.prepare("DELETE FROM json_blocks WHERE page_id = ?").run(pageId);

  const insertLink = db.prepare("INSERT INTO links (page_id, href, text) VALUES (?, ?, ?)");
  const insertJson = db.prepare(`
    INSERT INTO json_blocks (page_id, kind, source_url, status, content_type, body)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  db.exec("BEGIN");
  try {
    for (const link of links) {
      insertLink.run(pageId, link.href, link.text || "");
    }

    for (const block of jsonBlocks) {
      insertJson.run(
        pageId,
        block.kind,
        block.sourceUrl || null,
        block.status || null,
        block.contentType || null,
        typeof block.body === "string" ? block.body : JSON.stringify(block.body, null, 2),
      );
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
