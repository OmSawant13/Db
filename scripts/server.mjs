import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { openDb } from "./db.mjs";

const PORT = Number(process.env.PORT || 3000);
const db = openDb();

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

const SOURCE_ORIGIN = "https://efficient.app";

function json(res, value) {
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(value));
}

function notFound(res) {
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
}

function localPathToSourceUrl(url) {
  const source = new URL(url.pathname + url.search, SOURCE_ORIGIN);
  return source.href;
}

function rewriteCapturedHtml(html) {
  return html
    .replace(/(href|src)="\/(_next\/[^"]+)"/g, `$1="${SOURCE_ORIGIN}/$2"`)
    .replace(/(href|src)="\/(icons\/[^"]+)"/g, `$1="${SOURCE_ORIGIN}/$2"`)
    .replace(/(href|src)="\/(favicon[^"]*)"/g, `$1="${SOURCE_ORIGIN}/$2"`)
    .replace(/(href|src)="\/(icon\.[^"]*)"/g, `$1="${SOURCE_ORIGIN}/$2"`)
    .replace(/(href|src)="\/(apple-icon[^"]*)"/g, `$1="${SOURCE_ORIGIN}/$2"`)
    .replace(/(href|src)="\/(manifest[^"]*)"/g, `$1="${SOURCE_ORIGIN}/$2"`)
    .replace("</head>", `<script>window.__LOCAL_CLONE__=true;</script></head>`);
}

function serveCapturedPage(res, page) {
  res.writeHead(page.status || 200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(rewriteCapturedHtml(page.html));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === "/api/pages") {
    const pages = db.prepare(`
      SELECT
        pages.id,
        pages.url,
        pages.status,
        pages.title,
        pages.crawled_at AS crawledAt,
        length(pages.text) AS textLength,
        count(DISTINCT links.id) AS linkCount,
        count(DISTINCT json_blocks.id) AS jsonBlockCount
      FROM pages
      LEFT JOIN links ON links.page_id = pages.id
      LEFT JOIN json_blocks ON json_blocks.page_id = pages.id
      GROUP BY pages.id
      ORDER BY pages.id
    `).all();
    return json(res, pages);
  }

  if (url.pathname.startsWith("/api/pages/")) {
    const id = Number(url.pathname.split("/").pop());
    const page = db.prepare("SELECT * FROM pages WHERE id = ?").get(id);
    if (!page) return notFound(res);

    const links = db.prepare("SELECT href, text FROM links WHERE page_id = ? ORDER BY id").all(id);
    const jsonBlocks = db.prepare(`
      SELECT id, kind, source_url AS sourceUrl, status, content_type AS contentType, body
      FROM json_blocks
      WHERE page_id = ?
      ORDER BY id
    `).all(id).map((block) => ({
      ...block,
      bodyPreview: block.body.slice(0, 3000),
      bodyLength: block.body.length,
    }));

    return json(res, { page, links, jsonBlocks });
  }

  if (url.pathname === "/api/entities") {
    const tables = ["assets", "apps", "deals", "categories", "stacks", "comparisons", "courses", "page_sections"];
    const counts = Object.fromEntries(tables.map((table) => [
      table,
      db.prepare(`SELECT count(*) AS count FROM ${table}`).get().count,
    ]));
    return json(res, counts);
  }

  if (url.pathname.startsWith("/api/entities/")) {
    const table = url.pathname.split("/").pop();
    const allowed = new Set(["assets", "apps", "deals", "categories", "stacks", "comparisons", "courses", "page_sections"]);
    if (!allowed.has(table)) return notFound(res);

    const limit = Math.min(Number(url.searchParams.get("limit") || 200), 1000);
    return json(res, db.prepare(`SELECT * FROM ${table} ORDER BY id LIMIT ?`).all(limit));
  }

  if (url.pathname === "/_clone") {
    const body = await readFile("public/clone-index.html");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(body);
  }

  if (extname(url.pathname)) {
    const publicFile = join("public", url.pathname);
    try {
      const body = await readFile(publicFile);
      res.writeHead(200, { "Content-Type": mime[extname(publicFile)] || "application/octet-stream" });
      return res.end(body);
    } catch {
      // Fall through to captured page lookup.
    }
  }

  const page = db.prepare("SELECT * FROM pages WHERE url = ?").get(localPathToSourceUrl(url));
  if (page) return serveCapturedPage(res, page);
  notFound(res);
});

server.listen(PORT, () => {
  console.log(`Frontend running at http://localhost:${PORT}`);
});
