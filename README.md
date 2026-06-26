# Efficient SQLite Viewer

This app crawls `https://efficient.app/`, stores every crawled page in SQLite, then displays the captured page text, links, HTML, JSON-LD, Next.js flight data, and network JSON responses in a simple frontend.

## Install

```bash
npm install
```

## Crawl Into SQLite

```bash
MAX_PAGES=60 HEADLESS=true npm run crawl
```

Visible browser mode:

```bash
MAX_PAGES=60 HEADLESS=false npm run crawl
```

If Efficient shows a Vercel checkpoint or starts returning `429`, use a persistent Chrome profile:

```bash
USER_DATA_DIR=.chrome-profile HEADLESS=false MAX_PAGES=1 npm run crawl
```

Pass the checkpoint manually in the opened Chrome window, then run the larger crawl with the same profile:

```bash
USER_DATA_DIR=.chrome-profile HEADLESS=false MAX_PAGES=200 DELAY_MS=3000 npm run crawl
```

Useful options:

| Env Var | Default | Meaning |
|---|---:|---|
| `START_URL` | `https://efficient.app/` | First page to crawl |
| `MAX_PAGES` | `30` | Maximum internal pages to crawl |
| `DELAY_MS` | `1000` | Delay between pages |
| `HEADLESS` | `true` | Use `false` to show Chrome |
| `USER_DATA_DIR` | empty | Persistent Chrome profile folder |
| `DB_PATH` | `data/efficient.db` | SQLite database path |

## Start Frontend

```bash
npm run start
```

Open:

```text
http://localhost:3000
```

## What Is Stored

- Page URL
- HTTP status
- Title
- Full visible text from the page
- Full page HTML
- Every internal link found on the page
- JSON-LD scripts
- Next.js `self.__next_f.push(...)` payloads
- Parsed Next.js flight JSON rows
- Captured network JSON/RSC responses

## Normalize Business Data

After crawling, extract formatted business entities:

```bash
npm run normalize
```

Normalized tables:

```text
assets
apps
deals
categories
stacks
stack_apps
comparisons
comparison_apps
courses
page_sections
```

Inspect counts:

```text
http://localhost:3000/api/entities
```

Inspect records:

```text
http://localhost:3000/api/entities/apps
http://localhost:3000/api/entities/deals
http://localhost:3000/api/entities/categories
http://localhost:3000/api/entities/comparisons
```
# Db
