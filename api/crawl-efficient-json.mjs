import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

const START_URL = process.argv[2] || "https://efficient.app/";
const OUTPUT_DIR = process.env.OUTPUT_DIR || path.join(SCRIPT_DIR, "site-json-output");
const MAX_PAGES = Number(process.env.MAX_PAGES || 50);
const DELAY_MS = Number(process.env.DELAY_MS || 800);
const FETCH_MODE = process.env.FETCH_MODE || "fetch";
const CHROME_BIN = process.env.CHROME_BIN || "google-chrome-stable";
const CHROME_TIMEOUT_MS = Number(process.env.CHROME_TIMEOUT_MS || 45000);
const STOP_AFTER_429 = Number(process.env.STOP_AFTER_429 || 5);
const execFileAsync = promisify(execFile);

const SITE_ORIGIN = new URL(START_URL).origin;
const SKIP_PATH_PREFIXES = [
  "/_next/",
  "/icons/",
  "/favicon",
  "/icon.",
  "/apple-icon",
  "/manifest",
  "/api/",
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeFileName(url) {
  const parsed = new URL(url);
  const name = `${parsed.hostname}${parsed.pathname}${parsed.search}`
    .replace(/^www\./, "")
    .replace(/\/$/, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return name || "index";
}

function normalizeUrl(href, baseUrl) {
  try {
    const url = new URL(href, baseUrl);
    url.hash = "";

    if (url.origin !== SITE_ORIGIN) return null;
    if (SKIP_PATH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return null;
    if (/\.(css|js|svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|map)$/i.test(url.pathname)) return null;

    return url.href;
  } catch {
    return null;
  }
}

function extractLinks(html, baseUrl) {
  const links = new Set();
  const attrRe = /\b(?:href|src)=["']([^"']+)["']/gi;
  let match;

  while ((match = attrRe.exec(html))) {
    const normalized = normalizeUrl(match[1], baseUrl);
    if (normalized) links.add(normalized);
  }

  return [...links].sort();
}

function extractApiUrls(html, baseUrl) {
  const urls = new Set();
  const apiRe = /["'`](\/api\/[^"'`<>\s\\]*)["'`]/g;
  let match;

  while ((match = apiRe.exec(html))) {
    try {
      urls.add(new URL(match[1], baseUrl).href);
    } catch {
      // Ignore invalid URL fragments.
    }
  }

  return [...urls].sort();
}

function extractJsonLd(html) {
  const blocks = [];
  const re = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>(.*?)<\/script>/gis;
  let match;

  while ((match = re.exec(html))) {
    const text = htmlDecode(match[1].trim());
    try {
      blocks.push(JSON.parse(text));
    } catch {
      blocks.push({ parseError: true, raw: text });
    }
  }

  return blocks;
}

function htmlDecode(value) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function readBalancedCall(source, startIndex) {
  const openIndex = source.indexOf("(", startIndex);
  if (openIndex === -1) return null;

  let depth = 0;
  let inString = false;
  let quote = "";
  let escaped = false;

  for (let i = openIndex; i < source.length; i += 1) {
    const char = source[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        inString = false;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      quote = char;
      continue;
    }

    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;

    if (depth === 0) {
      return {
        raw: source.slice(openIndex + 1, i),
        endIndex: i + 1,
      };
    }
  }

  return null;
}

function extractNextFlight(html) {
  const pushes = [];
  let index = 0;

  while (true) {
    const start = html.indexOf("self.__next_f.push", index);
    if (start === -1) break;

    const call = readBalancedCall(html, start);
    if (!call) break;

    try {
      const parsed = JSON.parse(call.raw);
      pushes.push(parsed);
    } catch {
      pushes.push({ parseError: true, raw: call.raw });
    }

    index = call.endIndex;
  }

  const textChunks = pushes
    .flatMap((push) => Array.isArray(push) ? push.filter((item) => typeof item === "string") : [])
    .join("");

  return {
    pushCount: pushes.length,
    pushes,
    text: textChunks,
    parsedRows: parseFlightRows(textChunks),
  };
}

function parseFlightRows(text) {
  const rows = [];
  const lines = text.split("\n");

  for (const line of lines) {
    const match = /^([0-9a-z]+):(.+)$/i.exec(line);
    if (!match) continue;

    const [, id, payload] = match;
    const trimmed = payload.trim();

    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) continue;

    try {
      rows.push({
        id,
        type: trimmed.startsWith("{") ? "object" : "array",
        value: JSON.parse(trimmed),
      });
    } catch {
      rows.push({
        id,
        type: "unparsed",
        raw: trimmed.slice(0, 2000),
      });
    }
  }

  return rows;
}

function makePageMarkdown(page) {
  const lines = [
    `# Page JSON: ${page.url}`,
    "",
    "## Metadata",
    "",
    "| Field | Value |",
    "|---|---|",
    `| URL | ${page.url} |`,
    `| Status | ${page.status} |`,
    `| Content-Type | ${page.contentType || ""} |`,
    `| Title | ${page.title || ""} |`,
    `| Links Found | ${page.links.length} |`,
    `| API URLs Found | ${page.apiUrls.length} |`,
    `| JSON-LD Blocks | ${page.jsonLd.length} |`,
    `| Next Flight Pushes | ${page.nextFlight.pushCount} |`,
    `| Parsed Flight Rows | ${page.nextFlight.parsedRows.length} |`,
    "",
    "## Links",
    "",
    ...page.links.slice(0, 200).map((link) => `- ${link}`),
    "",
    "## API URLs",
    "",
    ...(page.apiUrls.length ? page.apiUrls.map((link) => `- ${link}`) : ["None found."]),
    "",
    "## Extracted JSON Files",
    "",
    "- `json-ld.json`: structured data scripts from the page",
    "- `next-flight-pushes.json`: raw `self.__next_f.push(...)` arrays",
    "- `next-flight-rows.json`: rows from the joined flight payload that parsed as JSON",
    "- `next-flight.txt`: joined raw flight text",
    "",
  ];

  return lines.join("\n");
}

async function fetchText(url) {
  if (FETCH_MODE === "chrome") {
    const { stdout } = await execFileAsync(
      CHROME_BIN,
      [
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-background-networking",
        "--dump-dom",
        url,
      ],
      {
        timeout: CHROME_TIMEOUT_MS,
        maxBuffer: 50 * 1024 * 1024,
      },
    );

    const isCheckpoint = /Vercel Security Checkpoint|429 Too Many Requests/i.test(stdout);

    return {
      status: isCheckpoint ? 429 : 200,
      contentType: "text/html; charset=utf-8",
      text: stdout,
    };
  }

  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/json,text/plain,*/*",
      "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36",
      Referer: SITE_ORIGIN,
    },
  });

  return {
    status: response.status,
    contentType: response.headers.get("content-type") || "",
    text: await response.text(),
  };
}

async function savePage(page) {
  const dir = path.join(OUTPUT_DIR, "pages", safeFileName(page.url));
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "page.md"), makePageMarkdown(page));
  await writeFile(path.join(dir, "links.json"), `${JSON.stringify(page.links, null, 2)}\n`);
  await writeFile(path.join(dir, "api-urls.json"), `${JSON.stringify(page.apiUrls, null, 2)}\n`);
  await writeFile(path.join(dir, "json-ld.json"), `${JSON.stringify(page.jsonLd, null, 2)}\n`);
  await writeFile(path.join(dir, "next-flight-pushes.json"), `${JSON.stringify(page.nextFlight.pushes, null, 2)}\n`);
  await writeFile(path.join(dir, "next-flight-rows.json"), `${JSON.stringify(page.nextFlight.parsedRows, null, 2)}\n`);
  await writeFile(path.join(dir, "next-flight.txt"), page.nextFlight.text);
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const queue = [START_URL];
  const seen = new Set();
  const pages = [];
  const allApiUrls = new Set();
  let consecutive429 = 0;

  while (queue.length && pages.length < MAX_PAGES) {
    const url = queue.shift();
    if (!url || seen.has(url)) continue;
    seen.add(url);

    console.log(`[${pages.length + 1}/${MAX_PAGES}] ${url}`);

    let fetched;
    try {
      fetched = await fetchText(url);
    } catch (error) {
      pages.push({ url, error: error.message });
      continue;
    }

    const title = /<title[^>]*>(.*?)<\/title>/is.exec(fetched.text)?.[1]?.trim() || "";
    const links = extractLinks(fetched.text, url);
    const apiUrls = extractApiUrls(fetched.text, url);
    const jsonLd = extractJsonLd(fetched.text);
    const nextFlight = extractNextFlight(fetched.text);

    for (const link of links) {
      if (!seen.has(link) && queue.length + pages.length < MAX_PAGES * 3) queue.push(link);
    }

    for (const apiUrl of apiUrls) allApiUrls.add(apiUrl);

    const page = {
      url,
      status: fetched.status,
      contentType: fetched.contentType,
      title,
      links,
      apiUrls,
      jsonLd,
      nextFlight,
    };

    pages.push({
      url,
      status: fetched.status,
      title,
      linkCount: links.length,
      apiUrlCount: apiUrls.length,
      jsonLdCount: jsonLd.length,
      nextFlightPushCount: nextFlight.pushCount,
      parsedFlightRowCount: nextFlight.parsedRows.length,
      outputDir: `pages/${safeFileName(url)}`,
    });

    await savePage(page);

    if (fetched.status === 429) {
      consecutive429 += 1;
      if (consecutive429 >= STOP_AFTER_429) {
        console.log(`Stopping after ${consecutive429} consecutive 429 responses. Try FETCH_MODE=chrome or increase DELAY_MS.`);
        break;
      }
    } else {
      consecutive429 = 0;
    }

    await sleep(DELAY_MS);
  }

  const indexLines = [
    "# Efficient Site JSON Crawl",
    "",
    `Start URL: ${START_URL}`,
    `Generated at: ${new Date().toISOString()}`,
    `Pages crawled: ${pages.length}`,
    "",
    "## Pages",
    "",
    "| # | URL | Status | Links | JSON-LD | Flight Pushes | Parsed Rows | Output |",
    "|---:|---|---:|---:|---:|---:|---:|---|",
    ...pages.map((page, index) => (
      `| ${index + 1} | ${page.url || ""} | ${page.status || ""} | ${page.linkCount || 0} | ${page.jsonLdCount || 0} | ${page.nextFlightPushCount || 0} | ${page.parsedFlightRowCount || 0} | ${page.outputDir || ""} |`
    )),
    "",
    "## Discovered API URLs",
    "",
    ...([...allApiUrls].length ? [...allApiUrls].sort().map((url) => `- ${url}`) : ["None found in HTML."]),
    "",
  ];

  await writeFile(path.join(OUTPUT_DIR, "index.md"), indexLines.join("\n"));
  await writeFile(path.join(OUTPUT_DIR, "pages.json"), `${JSON.stringify(pages, null, 2)}\n`);
  await writeFile(path.join(OUTPUT_DIR, "api-urls.json"), `${JSON.stringify([...allApiUrls].sort(), null, 2)}\n`);

  console.log(`Done. Output saved to ${OUTPUT_DIR}/`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
