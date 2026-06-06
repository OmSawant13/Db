import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const INPUT_FILE = process.argv[2] || "response.md";
const OUTPUT_DIR = "captured-output";

function safeFileName(input) {
  return path
    .basename(input)
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function extractUrlAndJson(text) {
  const lines = text.split(/\r?\n/);
  const url = lines.find((line) => /^https?:\/\//.test(line.trim()))?.trim() || "unknown source";
  const jsonStart = text.indexOf("{");

  if (jsonStart === -1) {
    throw new Error("No JSON object found. Expected a URL line followed by JSON.");
  }

  return {
    url,
    json: JSON.parse(text.slice(jsonStart)),
  };
}

function typeOf(value) {
  if (Array.isArray(value)) return `array(${value.length})`;
  if (value === null) return "null";
  return typeof value;
}

function makeMarkdown({ sourceFile, url, json }) {
  const lines = [
    `# Captured API Response: ${sourceFile}`,
    "",
    "## Metadata",
    "",
    "| Field | Value |",
    "|---|---|",
    `| Source File | ${sourceFile} |`,
    `| Captured URL | ${url} |`,
    `| Generated At | ${new Date().toISOString()} |`,
    "",
    "## Top-Level Structure",
    "",
    "| Key | Type | Notes |",
    "|---|---|---|",
  ];

  for (const [key, value] of Object.entries(json)) {
    const notes = Array.isArray(value)
      ? `${value.length} items`
      : value && typeof value === "object"
        ? `${Object.keys(value).length} keys`
        : JSON.stringify(value);

    lines.push(`| \`${key}\` | \`${typeOf(value)}\` | ${String(notes).replaceAll("|", "\\|")} |`);
  }

  for (const [key, value] of Object.entries(json)) {
    lines.push("");
    lines.push(`## ${key}`);
    lines.push("");

    if (value && typeof value === "object" && !Array.isArray(value)) {
      lines.push("| Child Key | Type | Notes |");
      lines.push("|---|---|---|");

      for (const [childKey, childValue] of Object.entries(value)) {
        const notes = Array.isArray(childValue)
          ? `${childValue.length} items`
          : childValue && typeof childValue === "object"
            ? `${Object.keys(childValue).length} keys`
            : JSON.stringify(childValue);

        lines.push(`| \`${childKey}\` | \`${typeOf(childValue)}\` | ${String(notes).replaceAll("|", "\\|")} |`);
      }
    } else {
      lines.push(`Type: \`${typeOf(value)}\``);
    }
  }

  lines.push("");
  lines.push("## Raw JSON");
  lines.push("");
  lines.push("The full parsed JSON is saved in the matching `.json` file.");
  lines.push("");

  return lines.join("\n");
}

async function main() {
  const text = await readFile(INPUT_FILE, "utf8");
  const { url, json } = extractUrlAndJson(text);
  const base = safeFileName(INPUT_FILE);

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(path.join(OUTPUT_DIR, `${base}.json`), `${JSON.stringify(json, null, 2)}\n`);
  await writeFile(path.join(OUTPUT_DIR, `${base}.md`), makeMarkdown({ sourceFile: INPUT_FILE, url, json }));

  console.log(`Converted ${INPUT_FILE}`);
  console.log(`Output saved to ${OUTPUT_DIR}/${base}.json and ${OUTPUT_DIR}/${base}.md`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
