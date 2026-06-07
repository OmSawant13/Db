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
