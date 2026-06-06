# Efficient JSON Extraction Automation

## Goal

Extract JSON-like data from `https://efficient.app/` and its linked nav/pages automatically.

The site is a Next.js app. Most page data is embedded in:

```text
self.__next_f.push(...)
```

The crawler extracts that data page by page.

## Main Script

```bash
node crawl-efficient-json.mjs https://efficient.app/
```

## Best Option: Playwright Network Crawler

This is the best method because it opens the site in Chrome and captures real network responses, including `/api/...` JSON calls.

Install dependencies:

```bash
npm install playwright
```

Run:

```bash
OUTPUT_DIR=playwright-output \
MAX_PAGES=60 \
DELAY_MS=1000 \
node playwright-efficient-crawler.mjs https://efficient.app/
```

Run visibly in Chrome:

```bash
HEADLESS=false \
OUTPUT_DIR=playwright-output \
MAX_PAGES=60 \
DELAY_MS=1000 \
node playwright-efficient-crawler.mjs https://efficient.app/
```

Playwright output:

```text
playwright-output/
  index.md
  pages.json
  all-json-responses.json
  pages/
    efficient-app/
      page.md
      links.json
      json-responses.json
      json-ld.json
      next-flight-pushes.json
      next-flight-rows.json
      next-flight.txt
```

Most important Playwright files:

| File | Meaning |
|---|---|
| `all-json-responses.json` | Index of every captured JSON/RSC response |
| `json-responses.json` | Per-page network JSON/RSC responses with bodies |
| `next-flight-rows.json` | Parsed embedded Next.js page data |
| `next-flight-pushes.json` | Raw embedded `self.__next_f.push(...)` data |
| `links.json` | Internal links discovered on that page |

## No-Install Option: Chrome Dump DOM

Use Chrome mode because the site may block raw automated fetches with Vercel security checkpoint / HTTP 429.

```bash
OUTPUT_DIR=site-json-output-chrome \
MAX_PAGES=60 \
DELAY_MS=1000 \
FETCH_MODE=chrome \
node crawl-efficient-json.mjs https://efficient.app/
```

## Fastest But More Easily Blocked

```bash
OUTPUT_DIR=site-json-output \
MAX_PAGES=60 \
DELAY_MS=1000 \
node crawl-efficient-json.mjs https://efficient.app/
```

## Output Structure

```text
site-json-output-chrome/
  index.md
  pages.json
  api-urls.json
  pages/
    efficient-app/
      page.md
      links.json
      api-urls.json
      json-ld.json
      next-flight-pushes.json
      next-flight-rows.json
      next-flight.txt
```

## What Each File Means

| File | Meaning |
|---|---|
| `index.md` | Human-readable crawl summary |
| `pages.json` | List of crawled pages and extraction counts |
| `api-urls.json` | API URLs discovered in HTML |
| `page.md` | Per-page summary |
| `links.json` | Links found on that page |
| `api-urls.json` | API URLs found on that page |
| `json-ld.json` | Structured data from `<script type="application/ld+json">` |
| `next-flight-pushes.json` | Raw parsed `self.__next_f.push(...)` arrays |
| `next-flight-rows.json` | Flight rows that could be parsed as JSON |
| `next-flight.txt` | Joined raw Next.js flight payload text |

## Useful Environment Variables

| Variable | Default | Meaning |
|---|---:|---|
| `OUTPUT_DIR` | `site-json-output` | Folder to write extracted data |
| `MAX_PAGES` | `50` | Maximum pages to crawl |
| `DELAY_MS` | `800` | Delay between pages |
| `FETCH_MODE` | `fetch` | Use `fetch` or `chrome` |
| `CHROME_BIN` | `google-chrome-stable` | Chrome executable |
| `CHROME_TIMEOUT_MS` | `45000` | Chrome timeout per page |
| `STOP_AFTER_429` | `5` | Stop after repeated 429 responses |

## Notes

- Raw `fetch` is fast but may trigger `429`.
- `FETCH_MODE=chrome` is slower but works better for this site.
- Direct `/api/...` endpoints are not always visible in HTML.
- Most useful page data is in `next-flight-pushes.json` and `next-flight-rows.json`.
