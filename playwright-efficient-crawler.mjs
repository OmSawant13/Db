import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const START_URL = process.argv[2] || "https://efficient.app/";
const OUTPUT_DIR = process.env.OUTPUT_DIR || "playwright-output";
const MAX_PAGES = Number(process.env.MAX_PAGES || 50);
const DELAY_MS = Number(process.env.DELAY_MS || 1000);
const HEADLESS = process.env.HEADLESS !== "false";
const CHANNEL = process.env.CHANNEL || "chrome";
const NAV_TIMEOUT_MS = Number(process.env.NAV_TIMEOUT_MS || 60000);
const SITE_ORIGIN = new URL(START_URL).origin;

const SKIP_PREFIXES = [
  "/_next/",
  "/icons/",
  "/favicon",
  "/icon.",
  "/apple-icon",
  "/manifest",
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeFileName(url) {
  const parsed = new URL(url);
  return `${parsed.hostname}${parsed.pathname}${parsed.search}`
    .replace(/^www\./, "")
    .replace(/\/$/, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "index";
}

function normalizeUrl(href, baseUrl) {
  try {
    const url = new URL(href, baseUrl);
    url.hash = "";

    if (url.origin !== SITE_ORIGIN) return null;
    if (SKIP_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return null;
    if (/\.(css|js|svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|map|pdf)$/i.test(url.pathname)) return null;

    return url.href;
  } catch {
    return null;
  }
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
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) inString = false;
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
      pushes.push(JSON.parse(call.raw));
    } catch {
      pushes.push({ parseError: true, raw: call.raw });
    }

    index = call.endIndex;
  }

  const text = pushes
    .flatMap((push) => Array.isArray(push) ? push.filter((item) => typeof item === "string") : [])
    .join("");

  return {
    pushCount: pushes.length,
    pushes,
    text,
    parsedRows: parseFlightRows(text),
  };
}

function parseFlightRows(text) {
  const rows = [];

  for (const line of text.split("\n")) {
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

function looksLikeJsonResponse(response) {
  const contentType = response.headers()["content-type"] || "";
  const url = response.url();
  return (
    contentType.includes("application/json") ||
    contentType.includes("text/x-component") ||
    contentType.includes("application/x-ndjson") ||
    url.includes("/api/") ||
    url.includes("_rsc=")
  );
}

async function collectLinks(page, currentUrl) {
  const hrefs = await page.locator("a[href]").evaluateAll((anchors) =>
    anchors.map((anchor) => anchor.getAttribute("href")).filter(Boolean)
  );

  return [...new Set(hrefs.map((href) => normalizeUrl(href, currentUrl)).filter(Boolean))].sort();
}

async function savePageOutput(pageData) {
  const dir = path.join(OUTPUT_DIR, "pages", safeFileName(pageData.url));
  await mkdir(dir, { recursive: true });

  await writeFile(path.join(dir, "page.md"), makePageMarkdown(pageData));
  await writeFile(path.join(dir, "links.json"), `${JSON.stringify(pageData.links, null, 2)}\n`);
  await writeFile(path.join(dir, "json-responses.json"), `${JSON.stringify(pageData.jsonResponses, null, 2)}\n`);
  await writeFile(path.join(dir, "json-ld.json"), `${JSON.stringify(pageData.jsonLd, null, 2)}\n`);
  await writeFile(path.join(dir, "next-flight-pushes.json"), `${JSON.stringify(pageData.nextFlight.pushes, null, 2)}\n`);
  await writeFile(path.join(dir, "next-flight-rows.json"), `${JSON.stringify(pageData.nextFlight.parsedRows, null, 2)}\n`);
  await writeFile(path.join(dir, "next-flight.txt"), pageData.nextFlight.text);
}

function makePageMarkdown(pageData) {
  return [
    `# Playwright Page Capture: ${pageData.url}`,
    "",
    "## Metadata",
    "",
    "| Field | Value |",
    "|---|---|",
    `| URL | ${pageData.url} |`,
    `| Status | ${pageData.status || ""} |`,
    `| Title | ${pageData.title || ""} |`,
    `| Links Found | ${pageData.links.length} |`,
    `| JSON Network Responses | ${pageData.jsonResponses.length} |`,
    `| JSON-LD Blocks | ${pageData.jsonLd.length} |`,
    `| Next Flight Pushes | ${pageData.nextFlight.pushCount} |`,
    `| Parsed Flight Rows | ${pageData.nextFlight.parsedRows.length} |`,
    "",
    "## JSON Network Responses",
    "",
    ...(pageData.jsonResponses.length
      ? pageData.jsonResponses.map((item) => `- ${item.status} ${item.url}`)
      : ["None captured."]),
    "",
    "## Links",
    "",
    ...pageData.links.slice(0, 300).map((link) => `- ${link}`),
    "",
  ].join("\n");
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({
    channel: CHANNEL,
    headless: HEADLESS,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 1200 },
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36",
  });

  const queue = [START_URL];
  const seen = new Set();
  const summaries = [];
  const allJsonResponses = [];

  try {
    while (queue.length && summaries.length < MAX_PAGES) {
      const url = queue.shift();
      if (!url || seen.has(url)) continue;
      seen.add(url);

      console.log(`[${summaries.length + 1}/${MAX_PAGES}] ${url}`);

      const page = await context.newPage();
      const jsonResponses = [];
      let mainStatus = null;

      page.on("response", async (response) => {
        if (response.request().resourceType() === "document" && response.url() === url) {
          mainStatus = response.status();
        }

        if (!looksLikeJsonResponse(response)) return;

        const record = {
          url: response.url(),
          status: response.status(),
          contentType: response.headers()["content-type"] || "",
          requestMethod: response.request().method(),
          resourceType: response.request().resourceType(),
          body: null,
        };

        try {
          const text = await response.text();
          try {
            record.body = JSON.parse(text);
            record.bodyType = "json";
          } catch {
            record.body = text;
            record.bodyType = "text";
          }
        } catch (error) {
          record.error = error.message;
        }

        jsonResponses.push(record);
      });

      try {
        await page.goto(url, { waitUntil: "networkidle", timeout: NAV_TIMEOUT_MS });
      } catch {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS }).catch(() => {});
      }

      await page.waitForTimeout(1000);

      const html = await page.content();
      const title = await page.title();
      const links = await collectLinks(page, url);
      const jsonLd = extractJsonLd(html);
      const nextFlight = extractNextFlight(html);

      for (const link of links) {
        if (!seen.has(link) && queue.length < MAX_PAGES * 4) queue.push(link);
      }

      const pageData = {
        url,
        status: mainStatus,
        title,
        links,
        jsonResponses,
        jsonLd,
        nextFlight,
      };

      await savePageOutput(pageData);

      summaries.push({
        url,
        status: mainStatus,
        title,
        linkCount: links.length,
        jsonResponseCount: jsonResponses.length,
        jsonLdCount: jsonLd.length,
        nextFlightPushCount: nextFlight.pushCount,
        parsedFlightRowCount: nextFlight.parsedRows.length,
        outputDir: `pages/${safeFileName(url)}`,
      });

      for (const item of jsonResponses) {
        allJsonResponses.push({
          pageUrl: url,
          responseUrl: item.url,
          status: item.status,
          contentType: item.contentType,
          bodyType: item.bodyType,
        });
      }

      await page.close();
      await sleep(DELAY_MS);
    }
  } finally {
    await browser.close();
  }

  const indexLines = [
    "# Playwright Efficient JSON Crawl",
    "",
    `Start URL: ${START_URL}`,
    `Generated at: ${new Date().toISOString()}`,
    `Pages crawled: ${summaries.length}`,
    "",
    "## Pages",
    "",
    "| # | URL | Status | Links | JSON Responses | JSON-LD | Flight Rows | Output |",
    "|---:|---|---:|---:|---:|---:|---:|---|",
    ...summaries.map((page, index) =>
      `| ${index + 1} | ${page.url} | ${page.status || ""} | ${page.linkCount} | ${page.jsonResponseCount} | ${page.jsonLdCount} | ${page.parsedFlightRowCount} | ${page.outputDir} |`
    ),
    "",
  ];

  await writeFile(path.join(OUTPUT_DIR, "index.md"), `${indexLines.join("\n")}\n`);
  await writeFile(path.join(OUTPUT_DIR, "pages.json"), `${JSON.stringify(summaries, null, 2)}\n`);
  await writeFile(path.join(OUTPUT_DIR, "all-json-responses.json"), `${JSON.stringify(allJsonResponses, null, 2)}\n`);

  console.log(`Done. Output saved to ${OUTPUT_DIR}/`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
