import { writeFileSync } from "node:fs";
import { openDb } from "./db.mjs";

const db = openDb();

// Load apps for name-based fallback slug generation
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

// Recursive Lexical text parser
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
  
  // Check if this page is crawled in the DB
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
console.log("Successfully generated comparisons_catalog.md with full crawled text.");
db.close();
