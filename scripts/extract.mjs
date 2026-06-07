export function normalizeUrl(href, baseUrl, origin) {
  try {
    const url = new URL(href, baseUrl);
    url.hash = "";

    if (url.origin !== origin) return null;
    if (url.pathname.startsWith("/_next/")) return null;
    if (url.pathname.startsWith("/icons/")) return null;
    if (url.pathname.startsWith("/api/")) return null;
    if (/\.(css|js|svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|map|pdf)$/i.test(url.pathname)) return null;

    return url.href;
  } catch {
    return null;
  }
}

export function extractJsonLd(html) {
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

export function extractNextFlight(html) {
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
    pushes,
    rows: parseFlightRows(text),
    text,
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
      rows.push({ id, value: JSON.parse(trimmed) });
    } catch {
      rows.push({ id, raw: trimmed.slice(0, 4000) });
    }
  }

  return rows;
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

function htmlDecode(value) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}
