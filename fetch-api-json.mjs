import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const URLS_FILE = "api-urls.txt";
const OUTPUT_DIR = "api-output";
const RETRIES = 3;
const RETRY_DELAY_MS = 1500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeFileName(url) {
  const parsed = new URL(url);
  const base = `${parsed.hostname}${parsed.pathname}`
    .replace(/^www\./, "")
    .replace(/\/$/, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  const search = parsed.search
    ? `-${Buffer.from(parsed.search).toString("base64url").slice(0, 12)}`
    : "";

  return `${base}${search || ""}`;
}

function typeOf(value) {
  if (Array.isArray(value)) return `array(${value.length})`;
  if (value === null) return "null";
  return typeof value;
}

function summarizeValue(value, indent = "") {
  if (Array.isArray(value)) {
    const first = value[0];
    return [
      `${indent}- type: array`,
      `${indent}- count: ${value.length}`,
      first === undefined ? `${indent}- first item: empty` : `${indent}- first item type: ${typeOf(first)}`,
    ].join("\n");
  }

  if (value && typeof value === "object") {
    const keys = Object.keys(value);
    return [
      `${indent}- type: object`,
      `${indent}- keys: ${keys.length ? keys.map((key) => `\`${key}\``).join(", ") : "none"}`,
    ].join("\n");
  }

  return `${indent}- type: ${typeOf(value)}\n${indent}- value: ${JSON.stringify(value)}`;
}

function sampleRows(value) {
  if (!Array.isArray(value) || value.length === 0) return "";

  const rows = value.slice(0, 5).map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return `| ${index + 1} | ${typeOf(item)} | ${JSON.stringify(item)} |`;
    }

    const label = item.name || item.title || item.slug || item.id || `item ${index + 1}`;
    const keys = Object.keys(item).slice(0, 12).map((key) => `\`${key}\``).join(", ");
    return `| ${index + 1} | ${String(label).replaceAll("|", "\\|")} | ${keys} |`;
  });

  return [
    "",
    "| # | Sample | Keys |",
    "|---:|---|---|",
    ...rows,
  ].join("\n");
}

function makeMarkdown({ url, status, headers, json }) {
  const generatedAt = new Date().toISOString();
  const topLevel = json && typeof json === "object" && !Array.isArray(json)
    ? Object.entries(json)
    : [];

  const lines = [
    `# API Response: ${url}`,
    "",
    "## Metadata",
    "",
    `| Field | Value |`,
    `|---|---|`,
    `| URL | ${url} |`,
    `| Status | ${status} |`,
    `| Content-Type | ${headers["content-type"] || ""} |`,
    `| Generated At | ${generatedAt} |`,
    "",
    "## Top-Level Structure",
    "",
  ];

  if (!topLevel.length) {
    lines.push(`Root type: \`${typeOf(json)}\``);
  } else {
    lines.push("| Key | Type | Notes |");
    lines.push("|---|---|---|");
    for (const [key, value] of topLevel) {
      const notes = Array.isArray(value)
        ? `${value.length} items`
        : value && typeof value === "object"
          ? `${Object.keys(value).length} keys`
          : JSON.stringify(value);
      lines.push(`| \`${key}\` | \`${typeOf(value)}\` | ${String(notes).replaceAll("|", "\\|")} |`);
    }
  }

  for (const [key, value] of topLevel) {
    lines.push("");
    lines.push(`## \`${key}\``);
    lines.push("");
    lines.push(summarizeValue(value));
    lines.push(sampleRows(value));

    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [childKey, childValue] of Object.entries(value)) {
        lines.push("");
        lines.push(`### \`${key}.${childKey}\``);
        lines.push("");
        lines.push(summarizeValue(childValue));
        lines.push(sampleRows(childValue));
      }
    }
  }

  lines.push("");
  lines.push("## Raw JSON File");
  lines.push("");
  lines.push("The full response is saved in the matching `.json` file in this folder.");
  lines.push("");

  return lines.join("\n");
}

async function fetchJson(url) {
  let lastError;

  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json,text/plain,*/*",
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36",
        Referer: "https://efficient.app/",
      },
    });

    const text = await response.text();

    if (response.status === 429 && attempt < RETRIES) {
      lastError = new Error(`HTTP 429 rate limited on attempt ${attempt}.`);
      await sleep(RETRY_DELAY_MS * attempt);
      continue;
    }

    let json;

    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`Response is not valid JSON. Status ${response.status}. First 200 chars: ${text.slice(0, 200)}`);
    }

    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      json,
    };
  }

  throw lastError || new Error(`Could not fetch ${url}`);
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const rawUrls = await readFile(URLS_FILE, "utf8");
  const urls = rawUrls
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  if (!urls.length) {
    throw new Error(`No URLs found in ${URLS_FILE}`);
  }

  const indexRows = [
    "# API Output Index",
    "",
    `Generated at: ${new Date().toISOString()}`,
    "",
    "| # | URL | JSON | Markdown | Status |",
    "|---:|---|---|---|---:|",
  ];

  for (const [index, url] of urls.entries()) {
    console.log(`Fetching ${url}`);
    const fileBase = safeFileName(url);
    const jsonPath = path.join(OUTPUT_DIR, `${fileBase}.json`);
    const mdPath = path.join(OUTPUT_DIR, `${fileBase}.md`);

    try {
      const result = await fetchJson(url);
      await writeFile(jsonPath, `${JSON.stringify(result.json, null, 2)}\n`);
      await writeFile(mdPath, makeMarkdown({ url, ...result }));

      indexRows.push(`| ${index + 1} | ${url} | [json](${fileBase}.json) | [md](${fileBase}.md) | ${result.status} |`);
    } catch (error) {
      const errorPath = path.join(OUTPUT_DIR, `${fileBase}.error.md`);
      await writeFile(errorPath, `# Fetch Error\n\nURL: ${url}\n\n\`\`\`text\n${error.message}\n\`\`\`\n`);
      indexRows.push(`| ${index + 1} | ${url} | - | [error](${fileBase}.error.md) | - |`);
    }
  }

  await writeFile(path.join(OUTPUT_DIR, "index.md"), `${indexRows.join("\n")}\n`);
  console.log(`Done. Output saved to ${OUTPUT_DIR}/`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
