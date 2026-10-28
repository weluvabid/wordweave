#!/usr/bin/env node
/* global fetch, URLSearchParams, AbortSignal, setTimeout */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const CORPUS_DIR = resolve(ROOT, "corpus");
const MANIFEST_PATH = join(CORPUS_DIR, "manifest.json");
const USER_AGENT = "WordWeave-CorpusResearch/1.0 (reproducible collision analysis)";
const TOKEN_PATTERN = /[\p{L}\p{M}\p{N}_]+(?:['’-][\p{L}\p{M}\p{N}_]+)*/gu;
const TARGETS = Object.freeze({ literature: 300_000, technical: 300_000, general: 400_000 });
const REQUEST_DELAY_MS = 350;

function log(message) {
  process.stdout.write(`${message}\n`);
}

function warn(message) {
  process.stderr.write(`${message}\n`);
}

const GUTENBERG_BOOKS = [
  [1342, "Pride and Prejudice"], [11, "Alice's Adventures in Wonderland"],
  [84, "Frankenstein"], [1661, "The Adventures of Sherlock Holmes"],
  [98, "A Tale of Two Cities"], [2701, "Moby-Dick"], [76, "Adventures of Huckleberry Finn"],
  [74, "The Adventures of Tom Sawyer"], [345, "Dracula"], [35, "The Time Machine"],
  [1400, "Great Expectations"], [1260, "Jane Eyre"], [1952, "The Yellow Wallpaper"],
  [2591, "Grimms' Fairy Tales"], [2600, "War and Peace"], [55, "The Wonderful Wizard of Oz"],
  [4300, "Ulysses"], [120, "Treasure Island"], [514, "Little Women"],
  [1998, "Thus Spake Zarathustra"],
  [730, "Oliver Twist"], [244, "A Study in Scarlet"], [174, "The Picture of Dorian Gray"],
  [1184, "The Count of Monte Cristo"], [46, "A Christmas Carol"], [36, "The War of the Worlds"],
  [140, "The Jungle Book"], [209, "The Turn of the Screw"], [1727, "The Odyssey"],
];

const PYTHON_DOC_PATHS = [
  "Doc/tutorial/index.rst", "Doc/tutorial/introduction.rst", "Doc/tutorial/interpreter.rst",
  "Doc/tutorial/controlflow.rst", "Doc/tutorial/datastructures.rst", "Doc/tutorial/modules.rst",
  "Doc/tutorial/inputoutput.rst", "Doc/tutorial/errors.rst", "Doc/tutorial/classes.rst",
  "Doc/tutorial/stdlib.rst", "Doc/tutorial/stdlib2.rst", "Doc/tutorial/venv.rst",
  "Doc/tutorial/whatnow.rst", "Doc/library/asyncio.rst", "Doc/library/argparse.rst",
  "Doc/library/collections.rst", "Doc/library/concurrent.futures.rst", "Doc/library/contextlib.rst",
  "Doc/library/csv.rst", "Doc/library/dataclasses.rst", "Doc/library/datetime.rst",
  "Doc/library/decimal.rst", "Doc/library/enum.rst", "Doc/library/functools.rst",
  "Doc/library/glob.rst", "Doc/library/itertools.rst", "Doc/library/json.rst",
  "Doc/library/logging.rst", "Doc/library/math.rst", "Doc/library/os.rst",
  "Doc/library/pathlib.rst", "Doc/library/pickle.rst", "Doc/library/re.rst",
  "Doc/library/secrets.rst", "Doc/library/shutil.rst", "Doc/library/sqlite3.rst",
  "Doc/library/statistics.rst", "Doc/library/string.rst", "Doc/library/subprocess.rst",
  "Doc/library/threading.rst", "Doc/library/time.rst", "Doc/library/typing.rst",
  "Doc/library/unittest.rst", "Doc/library/urllib.rst", "Doc/library/uuid.rst",
  "Doc/library/venv.rst", "Doc/howto/argparse.rst", "Doc/howto/functional.rst",
  "Doc/howto/logging.rst", "Doc/howto/regex.rst", "Doc/howto/sockets.rst",
];

const WIKIPEDIA_QUERIES = [
  "history of science", "world history", "geography", "climate change", "ecology",
  "mathematics", "physics", "chemistry", "biology", "computer science",
  "technology", "economics", "education", "agriculture", "architecture",
  "literature", "music history", "visual arts", "philosophy", "linguistics",
  "medicine", "public health", "astronomy", "oceanography", "anthropology",
  "archaeology", "political history", "transportation", "food history", "energy",
];

function tokenCount(text) {
  return [...text.matchAll(TOKEN_PATTERN)].length;
}

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function slug(value) {
  return (
    value
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 90)
      .toLowerCase() || "document"
  );
}

function cleanGutenberg(text) {
  const start = text.search(/\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i);
  const endMatch = [
    ...text.matchAll(/\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/gi),
  ].at(-1);
  if (start >= 0 && endMatch?.index !== undefined) {
    const startEnd = text.indexOf("\n", start);
    return text.slice(startEnd >= 0 ? startEnd + 1 : start, endMatch.index).trim();
  }
  return text.trim();
}

function stripRstMarkup(text) {
  return text
    .replace(/^\.\.\s+\w+::[^\n]*(?:\n[ \t]+[^\n]*)*/gm, " ")
    .replace(/:([a-z][a-z0-9_-]*):`([^`]+)`/gi, "$2")
    .replace(/``([^`]+)``/g, "$1")
    .replace(/`([^`]+)`_/g, "$1")
    .replace(/^[-=~^#*+`:. ]{3,}\s*$/gm, " ")
    .replace(/\|[^\n]*\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchText(url, { accept = "text/plain", retries = 4 } = {}) {
  let lastError;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: accept },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) return await response.text();
      if (response.status === 404 || response.status === 410) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }
      throw new Error(`HTTP ${response.status} for ${url}`);
    } catch (error) {
      lastError = error;
      if (error instanceof Error && /HTTP 404|HTTP 410/.test(error.message)) throw error;
      if (attempt + 1 < retries) await sleep(800 * (attempt + 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Unable to fetch ${url}`);
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function readManifest() {
  try {
    const parsed = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
    if (parsed.schemaVersion === 1 && Array.isArray(parsed.documents)) return parsed;
  } catch {
    // A missing or invalid manifest is rebuilt from fetched documents.
  }
  return { schemaVersion: 1, createdBy: "WordWeave corpus fetcher", documents: [] };
}

async function localFileMatches(record) {
  try {
    const content = await readFile(join(CORPUS_DIR, record.path), "utf8");
    return sha256(content.trim()) === record.sha256;
  } catch {
    return false;
  }
}

async function saveDocument(manifest, { category, id, title, url, license, attribution, text }) {
  const extension = category === "technical" ? "rst" : "txt";
  const relativePath = join(category, `${slug(id)}-${slug(title)}.${extension}`).replaceAll(
    "\\",
    "/",
  );
  const absolutePath = join(CORPUS_DIR, relativePath);
  await mkdir(dirname(absolutePath), { recursive: true });
  const existing = manifest.documents.find((item) => item.id === id && item.url === url);
  const contentHash = sha256(text);

  if (existing && existing.sha256 === contentHash) {
    try {
      const current = await readFile(absolutePath, "utf8");
      if (sha256(current.trim()) === contentHash) return existing;
    } catch {
      // Re-create a missing or damaged local file below.
    }
  }

  await writeFile(absolutePath, `${text.trim()}\n`, "utf8");
  const record = {
    id, category, title, path: relativePath, url, license, attribution,
    tokenCount: tokenCount(text), characterCount: text.length, sha256: contentHash,
  };
  const index = manifest.documents.findIndex((item) => item.id === id && item.url === url);
  if (index >= 0) manifest.documents[index] = record;
  else manifest.documents.push(record);
  await writeManifest(manifest);
  return record;
}

async function writeManifest(manifest) {
  manifest.documents.sort(
    (a, b) => a.category.localeCompare(b.category) || a.path.localeCompare(b.path),
  );
  manifest.generatedAt = new Date().toISOString();
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function categoryTokens(manifest, category) {
  return manifest.documents
    .filter((item) => item.category === category)
    .reduce((sum, item) => sum + item.tokenCount, 0);
}

async function fetchLiterature(manifest) {
  log(`\n[Literature] Target: ${TARGETS.literature.toLocaleString()} tokens`);
  for (const [bookId, title] of GUTENBERG_BOOKS) {
    if (categoryTokens(manifest, "literature") >= TARGETS.literature) break;
    const url = `https://www.gutenberg.org/cache/epub/${bookId}/pg${bookId}.txt`;
    const existing = manifest.documents.find(
      (item) => item.id === `gutenberg-${bookId}` && item.url === url && item.sha256,
    );
    if (existing && await localFileMatches(existing)) {
      log(`  Reusing ${title}`);
      continue;
    }
    try {
      const raw = await fetchText(url);
      const text = cleanGutenberg(raw);
      if (tokenCount(text) < 2_000) throw new Error("Downloaded text was unexpectedly short");
      await saveDocument(manifest, {
        category: "literature", id: `gutenberg-${bookId}`, title, url,
        license:
          "Public domain in the United States; verify local jurisdiction before redistribution",
        attribution: `Project Gutenberg eBook ${bookId}: ${title}`,
        text,
      });
      log(`  Added ${title} (${tokenCount(text).toLocaleString()} tokens)`);
    } catch (error) {
      warn(`  Skipped ${title}: ${error instanceof Error ? error.message : String(error)}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }
}

async function fetchTechnical(manifest) {
  log(`\n[Technical documentation] Target: ${TARGETS.technical.toLocaleString()} tokens`);
  const base = "https://raw.githubusercontent.com/python/cpython/3.14/";
  let paths = PYTHON_DOC_PATHS;
  try {
    const treeUrl = "https://api.github.com/repos/python/cpython/git/trees/3.14?recursive=1";
    const treeText = await fetchText(treeUrl, { accept: "application/vnd.github+json" });
    const tree = JSON.parse(treeText);
    const discovered = (tree.tree ?? [])
      .filter(
        (entry) =>
          entry.type === "blob" &&
          /^Doc\/(?:tutorial|library|howto|faq|whatsnew)\/.*\.rst$/.test(entry.path),
      )
      .map((entry) => entry.path)
      .sort();
    if (discovered.length > 0) {
      paths = [...new Set([...PYTHON_DOC_PATHS, ...discovered])];
      const truncated = tree.truncated ? " (GitHub tree is truncated)" : "";
      log(`  Discovered ${discovered.length} documentation files${truncated}`);
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    warn(`  Could not enumerate Python documentation; using curated fallback list: ${detail}`);
  }
  for (const path of paths) {
    if (categoryTokens(manifest, "technical") >= TARGETS.technical) break;
    const url = `${base}${path}`;
    const id = `cpython-${path}`;
    const existing = manifest.documents.find(
      (item) => item.id === id && item.url === url && item.sha256,
    );
    if (existing && await localFileMatches(existing)) continue;
    try {
      const raw = await fetchText(url);
      const text = stripRstMarkup(raw);
      if (tokenCount(text) < 100) continue;
      await saveDocument(manifest, {
        category: "technical", id, title: basename(path, extname(path)), url,
        license:
          "Python Software Foundation License Version 2; see https://docs.python.org/3/license.html",
        attribution: `Python Software Foundation, CPython documentation source: ${path}`,
        text,
      });
      log(`  Added ${path} (${tokenCount(text).toLocaleString()} tokens)`);
    } catch (error) {
      warn(`  Skipped ${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }
}

async function wikipediaSearch(query) {
  const params = new URLSearchParams({
    action: "query", list: "search", srsearch: query, srlimit: "20", srnamespace: "0",
    format: "json", formatversion: "2",
  });
  const response = await fetchText(`https://en.wikipedia.org/w/api.php?${params}`, {
    accept: "application/json",
  });
  const data = JSON.parse(response);
  return data.query?.search ?? [];
}

async function wikipediaExtract(pageIds) {
  const params = new URLSearchParams({
    action: "query", pageids: pageIds.join("|"), prop: "extracts|info|revisions",
    explaintext: "1", exsectionformat: "plain", inprop: "url", rvprop: "ids",
    format: "json", formatversion: "2",
  });
  const response = await fetchText(`https://en.wikipedia.org/w/api.php?${params}`, {
    accept: "application/json",
  });
  const data = JSON.parse(response);
  return data.query?.pages ?? [];
}

async function fetchGeneral(manifest) {
  log(`\n[General prose] Target: ${TARGETS.general.toLocaleString()} tokens`);
  const knownIds = new Set();
  for (const item of manifest.documents.filter((record) => record.category === "general")) {
    if (await localFileMatches(item)) knownIds.add(item.id);
  }
  const pageById = new Map();
  for (const query of WIKIPEDIA_QUERIES) {
    if (categoryTokens(manifest, "general") >= TARGETS.general) break;
    try {
      const results = await wikipediaSearch(query);
      for (const result of results) pageById.set(String(result.pageid), result);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      warn(`  Search skipped (${query}): ${detail}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  const candidates = [...pageById.values()].sort((a, b) => a.pageid - b.pageid);
  for (
    let offset = 0;
    offset < candidates.length && categoryTokens(manifest, "general") < TARGETS.general;
    offset += 20
  ) {
    const batch = candidates
      .slice(offset, offset + 20)
      .filter((page) => !knownIds.has(`wikipedia-${page.pageid}`));
    if (batch.length === 0) continue;
    try {
      const pages = await wikipediaExtract(batch.map((page) => page.pageid));
      for (const page of pages) {
        if (categoryTokens(manifest, "general") >= TARGETS.general) break;
        const text = (page.extract ?? "").trim();
        if (tokenCount(text) < 250) continue;
        const pageUrl = page.fullurl || `https://en.wikipedia.org/?curid=${page.pageid}`;
        await saveDocument(manifest, {
          category: "general", id: `wikipedia-${page.pageid}`, title: page.title,
          url: pageUrl,
          license:
            "Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0); article content may include separately licensed material",
          attribution:
            `Wikipedia contributors, “${page.title}”, revision ${page.revisions?.[0]?.revid ?? "unknown"}`,
          text,
        });
        knownIds.add(`wikipedia-${page.pageid}`);
        log(`  Added ${page.title} (${tokenCount(text).toLocaleString()} tokens)`);
      }
    } catch (error) {
      warn(`  Article batch skipped: ${error instanceof Error ? error.message : String(error)}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }
}

function printSummary(manifest) {
  log("\nCorpus summary");
  let total = 0;
  for (const category of Object.keys(TARGETS)) {
    const tokens = categoryTokens(manifest, category);
    total += tokens;
    const state =
      tokens >= TARGETS[category]
        ? "target met"
        : `short by ${(TARGETS[category] - tokens).toLocaleString()}`;
    log(
      `  ${category.padEnd(12)} ${tokens.toLocaleString().padStart(10)} tokens / ${TARGETS[category].toLocaleString()} (${state})`,
    );
  }
  log(`  ${"TOTAL".padEnd(12)} ${total.toLocaleString().padStart(10)} tokens / 1,000,000`);
  log(`  Documents: ${manifest.documents.length}`);
  log(`  Manifest:  ${relative(ROOT, MANIFEST_PATH)}`);
  if (total < 1_000_000) {
    warn(
      "\nCorpus is below the 1-million-token target. Re-run the command to resume or extend collection.",
    );
  }
}

async function main() {
  if (process.argv.slice(2).some((arg) => arg === "--help" || arg === "-h")) {
    log(
      [
        "Usage: npm run corpus:fetch",
        "",
        "Downloads public-domain literature and Python documentation into ./corpus.",
        "Wikipedia prose is optional; pass --wikipedia to attempt collection (rate limits may apply).",
        "The operation is resumable; see corpus/manifest.json for source, license, revision, and SHA-256 metadata.",
      ].join("\n"),
    );
    return;
  }
  await mkdir(CORPUS_DIR, { recursive: true });
  const manifest = await readManifest();
  await fetchLiterature(manifest);
  await fetchTechnical(manifest);
  if (process.argv.slice(2).includes("--wikipedia")) {
    await fetchGeneral(manifest);
  } else {
    log("\n[General prose] Skipped (pass --wikipedia to enable Wikipedia requests)");
  }
  await writeManifest(manifest);
  printSummary(manifest);
}

main().catch((error) => {
  const detail = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${detail}\n`);
  process.exitCode = 1;
});
