import { chromium } from "playwright";
import { openDb, replacePageDetails, upsertPage } from "./db.mjs";
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
