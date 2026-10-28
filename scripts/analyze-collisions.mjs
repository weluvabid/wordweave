#!/usr/bin/env node
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import process from "node:process";
import { analyzeCorpusCollection } from "../dist/collision-analysis.js";

const SKIPPED_DIRECTORIES = new Set([".git", "node_modules", "dist", "coverage", "target", ".next"]);
const TEXT_EXTENSIONS = new Set([
  ".txt", ".md", ".html", ".htm", ".json", ".csv", ".xml", ".rst", ".log",
]);

function usage() {
  console.error(
    "Usage: npm run analyze:collisions -- <file-or-directory> [--json <report.json>]\n" +
      "Directories are scanned recursively for common text-file extensions.",
  );
  process.exit(2);
}

async function collectFiles(path) {
  let fileStat;
  try {
    fileStat = await stat(path);
  } catch {
    throw new Error(`Input path does not exist: ${path}`);
  }

  if (fileStat.isFile()) return [path];
  if (!fileStat.isDirectory()) throw new Error(`Input is not a file or directory: ${path}`);

  const files = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(child)));
    } else if (
      entry.isFile() &&
      entry.name.toLowerCase() !== "manifest.json" &&
      TEXT_EXTENSIONS.has(extname(entry.name).toLowerCase())
    ) {
      files.push(child);
    }
  }
  return files.sort();
}

function markdownReport(result) {
  const lines = [
    "# WordWeave collision analysis",
    "",
    `- Documents: ${result.documentCount}`,
    `- Characters (UTF-16 code units): ${result.characterCount}`,
    `- Tokens: ${result.tokenCount}`,
    `- Reserved-codeword collisions: ${result.collisionCount}`,
    `- Documents containing a collision: ${result.documentsWithCollision}`,
    `- Collisions per million tokens: ${result.collisionsPerMillionTokens.toFixed(3)}`,
    "",
    "## Most frequent colliding source terms",
    "",
    "| Source term | Reserved codeword | Occurrences |",
    "| --- | --- | ---: |",
  ];

  if (result.sourceCounts.length === 0) {
    lines.push("| — | — | 0 |");
  } else {
    for (const item of result.sourceCounts.slice(0, 20)) {
      lines.push(`| ${item.source} | ${item.codeword} | ${item.count} |`);
    }
  }

  lines.push("", "## Per-document results", "", "| Document | Tokens | Collisions | Per million tokens |", "| --- | ---: | ---: | ---: |");
  for (const item of result.documents) {
    lines.push(
      `| ${item.label.replaceAll("|", "\\|")} | ${item.tokenCount} | ${item.collisionCount} | ${item.collisionsPerMillionTokens.toFixed(3)} |`,
    );
  }
  lines.push(
    "",
    "## Interpretation",
    "",
    "A collision is an ordinary-text occurrence that exactly matches one of WordWeave's reserved four-word codewords at token boundaries. The decoder would interpret that phrase as an encoded source term. The rate is measured per million tokens in this corpus; it is an empirical corpus statistic, not a universal probability.",
    "",
  );
  return lines.join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0]?.startsWith("--")) usage();

  const inputPath = resolve(args[0]);
  let jsonPath;
  for (let index = 1; index < args.length; index += 1) {
    if (args[index] === "--json" && args[index + 1]) {
      jsonPath = resolve(args[index + 1]);
      index += 1;
    } else {
      usage();
    }
  }

  const files = await collectFiles(inputPath);
  if (files.length === 0) {
    throw new Error("No supported text files found in the input directory");
  }

  const documents = await Promise.all(
    files.map(async (path) => ({
      label: relative(process.cwd(), path) || path,
      text: await readFile(path, "utf8"),
    })),
  );
  const result = analyzeCorpusCollection(documents);
  process.stdout.write(markdownReport(result));

  if (jsonPath) {
    await writeFile(jsonPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    process.stderr.write(`JSON report written to ${jsonPath}\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
