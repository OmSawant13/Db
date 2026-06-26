import { chromium } from "playwright";
import { openDb, replacePageDetails, upsertPage } from "./db.mjs";
import { writeFileSync } from "node:fs";
import { extractJsonLd, extractNextFlight, normalizeUrl } from "./extract.mjs";

const START_URL = process.env.START_URL || "https://efficient.app/";
const MAX_PAGES = Number(process.env.MAX_PAGES || 30);
const DELAY_MS = Number(process.env.DELAY_MS || 1000);
const HEADLESS = process.env.HEADLESS !== "false";
const USER_DATA_DIR = process.env.USER_DATA_DIR || "";
const ORIGIN = new URL(START_URL).origin;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldCaptureResponse(response) {
  const contentType = response.headers()["content-type"] || "";
  const url = response.url();

  return (
    contentType.includes("application/json") ||
    contentType.includes("text/x-component") ||
    url.includes("/api/") ||
    url.includes("_rsc=")
  );
}

function updateCatalog(db) {
  const apps = db.prepare("SELECT id, name, slug FROM apps").all();
  const appByName = new Map();
  const appByCleanName = new Map();
  const cleanName = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, "");

  for (const app of apps) {
    if (app.name) appByName.set(app.name, app);
    if (app.name) appByCleanName.set(cleanName(app.name), app);
  }

  const normalizeAppName = (name) => {
    let n = name.trim();
    if (n === "Mercury Bank") return "Mercury";
    if (n === "Notion Calendar (Cron)") return "Notion Calendar";
    if (n === "Sidekick") return "Sidekick Browser";
    if (n === "Shift") return "Shift Browser";
    if (n === "Chrome") return "Google Chrome";
    if (n === "Brave Browser") return "Brave";
    if (n === "Payload") return "Payload CMS";
    if (n === "Motion AI") return "Motion";
    if (n === "Sintra AI") return "Sintra";
    return n;
  };

  function extractTextFromLexical(node) {
    if (!node) return "";
    if (node.type === "text") return node.text || "";
    if (node.children) {
      return node.children.map(extractTextFromLexical).join("");
    }
    return "";
  }

  function parseTldr(tldrStr) {
    if (!tldrStr) return "";
    try {
      const raw = JSON.parse(tldrStr);
      return extractTextFromLexical(raw.root).trim();
    } catch {
      return "";
    }
  }

  function cleanPageText(text) {
    if (!text) return "";
    let cleaned = text.trim();
    let idx = cleaned.indexOf("Comparison Summary");
    if (idx !== -1) {
      let slice = cleaned.slice(idx).trim();
      slice = slice.replace(/^Comparison Summary\s+Comparison Summary\s+Copy Link/i, "");
      cleaned = slice.trim();
    }

    const footerMarkers = [
      "In partnership with\nEfficient Stacks",
      "In partnership with\r\nEfficient Stacks",
      "Best Software\nSoftware Reviews",
      "Best Software\r\nSoftware Reviews",
      "Subscribe to our newsletter",
      "Best Rankings\nBest Email Clients",
      "Best Rankings\r\nBest Email Clients"
    ];

    for (const marker of footerMarkers) {
      const markerIdx = cleaned.indexOf(marker);
      if (markerIdx !== -1) {
        cleaned = cleaned.slice(0, markerIdx).trim();
      }
    }

    return cleaned;
  }

  const comparisons = db.prepare("SELECT name, tldr_json, raw_json FROM comparisons ORDER BY name").all();

  let md = `# Efficient App Comparisons Catalog

This document lists all the business software comparisons captured from [Efficient App](https://efficient.app), including their active verdicts, detailed text breakdowns (for crawled pages), and direct links.

---

## Comparisons List

| Comparison | App 1 | App 2 | Status | Live URL |
| :--- | :--- | :--- | :--- | :--- |
`;

  const details = [];

  for (const comp of comparisons) {
    let app1Slug = null;
    let app2Slug = null;
    
    try {
      const raw = JSON.parse(comp.raw_json);
      const docs = raw.comparisonApps?.docs || [];
      if (docs.length === 2) {
        const doc1 = docs[0];
        const doc2 = docs[1];
        if (doc1 && typeof doc1 === "object" && doc1.app?.slug) app1Slug = doc1.app.slug;
        if (doc2 && typeof doc2 === "object" && doc2.app?.slug) app2Slug = doc2.app.slug;
      }
    } catch {}

    if (!app1Slug || !app2Slug) {
      const parts = comp.name.split(" vs ");
      if (parts.length === 2) {
        const name1 = normalizeAppName(parts[0]);
        const name2 = normalizeAppName(parts[1]);
        const app1 = appByName.get(name1) || appByCleanName.get(cleanName(name1));
        const app2 = appByName.get(name2) || appByCleanName.get(cleanName(name2));
        if (app1) app1Slug = app1.slug;
        if (app2) app2Slug = app2.slug;
      }
    }

    const url = app1Slug && app2Slug ? `https://efficient.app/compare/${app1Slug}-vs-${app2Slug}` : "";
    const parts = comp.name.split(" vs ");
    const app1Name = parts[0] || "";
    const app2Name = parts[1] || "";
    
    let crawledRow = null;
    if (url) {
      crawledRow = db.prepare("SELECT text FROM pages WHERE url = ?").get(url);
    }

    const status = crawledRow ? "✅ Crawled" : "⏳ Not Crawled";
    md += `| ${comp.name} | ${app1Name} | ${app2Name} | ${status} | ${url ? `[Link](${url})` : "N/A"} |\n`;

    if (crawledRow) {
      const fullText = cleanPageText(crawledRow.text);
      details.push(`### ${comp.name}
${url ? `**Live Link**: [${url}](${url})\n` : ""}
**Detailed Comparison & Verdict**:
${fullText}

---`);
    } else {
      const verdict = parseTldr(comp.tldr_json);
      if (verdict) {
        details.push(`### ${comp.name}
${url ? `**Live Link**: [${url}](${url})\n` : ""}
**Verdict / TL;DR**:
> ${verdict.split("\n").join("\n> ")}

*(Full comparison article not crawled yet. Run the crawler to fetch.)*

---`);
      }
    }
  }

  md += "\n## Comparison Details & Verdicts\n\n" + details.join("\n\n");

  writeFileSync("comparisons_catalog.md", md, "utf8");
}

async function main() {
  const db = openDb();
  const browser = USER_DATA_DIR
    ? null
    : await chromium.launch({ channel: "chrome", headless: HEADLESS });
  const context = USER_DATA_DIR
    ? await chromium.launchPersistentContext(USER_DATA_DIR, {
      channel: "chrome",
      headless: HEADLESS,
      viewport: { width: 1440, height: 1200 },
      userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36",
    })
    : await browser.newContext({
      viewport: { width: 1440, height: 1200 },
      userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36",
    });

  const queue = [START_URL];
  const seen = new Set();

  // Optional: seed specific URLs (one per line) to crawl, e.g. missing app profile pages.
  if (process.env.SEED_FILE) {
    try {
      const { readFileSync } = await import("node:fs");
      const lines = readFileSync(process.env.SEED_FILE, "utf8")
        .split("\n").map((l) => l.trim()).filter(Boolean);
      let seeded = 0;
      for (const line of lines) {
        const seedUrl = line.startsWith("http") ? line : `${ORIGIN}${line.startsWith("/") ? "" : "/"}${line}`;
        queue.unshift(seedUrl);
        seeded += 1;
      }
      console.log(`Seeded ${seeded} URLs from SEED_FILE=${process.env.SEED_FILE}`);
    } catch (err) {
      console.error("Error reading SEED_FILE:", err.message);
    }
  }

  try {
    const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='comparisons'").get();
    if (tableExists) {
      const comparisons = db.prepare("SELECT name, raw_json FROM comparisons").all();
      const apps = db.prepare("SELECT id, name, slug FROM apps").all();
      
      const appByName = new Map();
      const appByCleanName = new Map();
      const cleanName = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, "");
      
      for (const app of apps) {
        if (app.name) appByName.set(app.name, app);
        if (app.name) appByCleanName.set(cleanName(app.name), app);
      }
      
      const normalizeAppName = (name) => {
        let n = name.trim();
        if (n === "Mercury Bank") return "Mercury";
        if (n === "Notion Calendar (Cron)") return "Notion Calendar";
        if (n === "Sidekick") return "Sidekick Browser";
        if (n === "Shift") return "Shift Browser";
        if (n === "Chrome") return "Google Chrome";
        if (n === "Brave Browser") return "Brave";
        if (n === "Payload") return "Payload CMS";
        if (n === "Motion AI") return "Motion";
        if (n === "Sintra AI") return "Sintra";
        return n;
      };

      const crawledPages = new Set(db.prepare("SELECT url FROM pages").all().map(p => p.url));
      let added = 0;
      
      for (const comp of comparisons) {
        try {
          const raw = JSON.parse(comp.raw_json);
          const docs = raw.comparisonApps?.docs || [];
          let app1Slug = null;
          let app2Slug = null;
          
          if (docs.length === 2) {
            const doc1 = docs[0];
            const doc2 = docs[1];
            
            if (doc1 && typeof doc1 === "object" && doc1.app?.slug) app1Slug = doc1.app.slug;
            if (doc2 && typeof doc2 === "object" && doc2.app?.slug) app2Slug = doc2.app.slug;
          }
          
          if (!app1Slug || !app2Slug) {
            const parts = comp.name.split(" vs ");
            if (parts.length === 2) {
              const name1 = normalizeAppName(parts[0]);
              const name2 = normalizeAppName(parts[1]);
              const app1 = appByName.get(name1) || appByCleanName.get(cleanName(name1));
              const app2 = appByName.get(name2) || appByCleanName.get(cleanName(name2));
              if (app1) app1Slug = app1.slug;
              if (app2) app2Slug = app2.slug;
            }
          }
          
          if (app1Slug && app2Slug) {
            const compUrl = `${ORIGIN}/compare/${app1Slug}-vs-${app2Slug}`;
            if (!crawledPages.has(compUrl)) {
              queue.push(compUrl);
              added++;
            }
          }
        } catch (e) {}
      }
      console.log(`Seeded crawl queue with ${added} missing comparison URLs from the database.`);
    }
  } catch (err) {
    console.error("Error seeding queue from DB:", err);
  }

  try {
    while (queue.length && seen.size < MAX_PAGES) {
      const url = queue.shift();
      if (!url || seen.has(url)) continue;
      seen.add(url);

      console.log(`[${seen.size}/${MAX_PAGES}] ${url}`);

      const page = await context.newPage();
      const networkBlocks = [];
      let status = null;

      page.on("response", async (response) => {
        if (response.url() === url && response.request().resourceType() === "document") {
          status = response.status();
        }

        if (!shouldCaptureResponse(response)) return;

        try {
          const bodyText = await response.text();
          let body = bodyText;
          try {
            body = JSON.parse(bodyText);
          } catch {
            // RSC responses are text, but still useful.
          }

          networkBlocks.push({
            kind: "network-response",
            sourceUrl: response.url(),
            status: response.status(),
            contentType: response.headers()["content-type"] || "",
            body,
          });
        } catch (error) {
          networkBlocks.push({
            kind: "network-response-error",
            sourceUrl: response.url(),
            status: response.status(),
            contentType: response.headers()["content-type"] || "",
            body: { error: error.message },
          });
        }
      });

      try {
        await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
      } catch {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
      }

      await page.waitForTimeout(1000);

      const html = await page.content();
      const title = await page.title();

      if (/Vercel Security Checkpoint|Too Many Requests/i.test(html + title)) {
        console.log(`Blocked/checkpoint detected on ${url}`);
        console.log("Run with HEADLESS=false USER_DATA_DIR=.chrome-profile, solve it once, then rerun.");
      }

      const text = await page.locator("body").innerText().catch(() => "");
      const links = await page.locator("a[href]").evaluateAll(
        (anchors) => anchors.map((anchor) => ({
          href: anchor.href,
          text: anchor.textContent?.trim() || "",
        })),
      );

      const normalizedLinks = [];
      const linkSeen = new Set();

      for (const link of links) {
        const normalized = normalizeUrl(link.href, url, ORIGIN);
        if (!normalized || linkSeen.has(normalized)) continue;
        linkSeen.add(normalized);
        normalizedLinks.push({ href: normalized, text: link.text });
        if (!seen.has(normalized) && queue.length < MAX_PAGES * 5) queue.push(normalized);
      }

      const jsonLd = extractJsonLd(html);
      const flight = extractNextFlight(html);
      const jsonBlocks = [
        ...jsonLd.map((body) => ({ kind: "json-ld", body })),
        { kind: "next-flight-pushes", body: flight.pushes },
        { kind: "next-flight-rows", body: flight.rows },
        { kind: "next-flight-text", body: flight.text },
        ...networkBlocks,
      ];

      const pageId = upsertPage(db, {
        url,
        status,
        title,
        text,
        html,
        crawledAt: new Date().toISOString(),
      });
      replacePageDetails(db, pageId, normalizedLinks, jsonBlocks);

      try {
        updateCatalog(db);
      } catch (err) {
        console.error("Error updating comparisons_catalog.md:", err);
      }

      await page.close();
      await sleep(DELAY_MS);
    }
  } finally {
    await context.close();
    if (browser) await browser.close();
    db.close();
  }

  console.log("Done. Data stored in SQLite.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
