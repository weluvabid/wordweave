import { findCodewordCollisions, type CodewordCollision } from "./codec.js";

const TOKEN_PATTERN = /[\p{L}\p{M}\p{N}_]+(?:['’-][\p{L}\p{M}\p{N}_]+)*/gu;

export interface SourceCollisionCount {
  readonly source: string;
  readonly codeword: string;
  readonly count: number;
}

export interface CorpusAnalysis {
  readonly label: string;
  readonly characterCount: number;
  readonly tokenCount: number;
  readonly collisionCount: number;
  readonly documentsWithCollision: number;
  readonly collisionsPerMillionTokens: number;
  readonly sourceCounts: readonly SourceCollisionCount[];
}

export interface CorpusDocument {
  readonly label: string;
  readonly text: string;
}

export interface CorpusCollectionAnalysis {
  readonly documentCount: number;
  readonly characterCount: number;
  readonly tokenCount: number;
  readonly collisionCount: number;
  readonly documentsWithCollision: number;
  readonly collisionsPerMillionTokens: number;
  readonly sourceCounts: readonly SourceCollisionCount[];
  readonly documents: readonly CorpusAnalysis[];
}

function countTokens(text: string): number {
  return [...text.matchAll(TOKEN_PATTERN)].length;
}

function collisionCounts(collisions: readonly CodewordCollision[]): SourceCollisionCount[] {
  const counts = new Map<string, SourceCollisionCount>();

  for (const collision of collisions) {
    const key = collision.source;
    const previous = counts.get(key);

    counts.set(
      key,
      Object.freeze({
        source: collision.source,
        codeword: collision.codeword.toLowerCase(),
        count: (previous?.count ?? 0) + 1,
      }),
    );
  }

  return [...counts.values()].sort(
    (left, right) => right.count - left.count || left.source.localeCompare(right.source),
  );
}

function ratePerMillion(collisions: number, tokens: number): number {
  return tokens === 0 ? 0 : (collisions / tokens) * 1_000_000;
}

export function analyzeCorpus(label: string, text: string): CorpusAnalysis {
  if (typeof label !== "string" || typeof text !== "string") {
    throw new TypeError("Corpus label and text must be strings");
  }

  const collisions = findCodewordCollisions(text);

  const tokenCount = countTokens(text);

  return Object.freeze({
    label,
    characterCount: text.length,
    tokenCount,
    collisionCount: collisions.length,
    documentsWithCollision: collisions.length > 0 ? 1 : 0,
    collisionsPerMillionTokens: ratePerMillion(collisions.length, tokenCount),
    sourceCounts: Object.freeze(collisionCounts(collisions)),
  });
}

export function analyzeCorpusCollection(
  documents: readonly CorpusDocument[],
): CorpusCollectionAnalysis {
  if (!Array.isArray(documents)) {
    throw new TypeError("Corpus documents must be an array");
  }

  const analyses = documents.map(({ label, text }) => analyzeCorpus(label, text));
  const sourceTotals = new Map<string, SourceCollisionCount>();

  for (const analysis of analyses) {
    for (const item of analysis.sourceCounts) {
      const previous = sourceTotals.get(item.source);

      sourceTotals.set(
        item.source,
        Object.freeze({
          source: item.source,
          codeword: item.codeword,
          count: (previous?.count ?? 0) + item.count,
        }),
      );
    }
  }

  const characterCount = analyses.reduce((total, item) => total + item.characterCount, 0);
  const tokenCount = analyses.reduce((total, item) => total + item.tokenCount, 0);
  const collisionCount = analyses.reduce((total, item) => total + item.collisionCount, 0);
  const documentsWithCollision = analyses.reduce(
    (total, item) => total + item.documentsWithCollision,
    0,
  );

  return Object.freeze({
    documentCount: analyses.length,
    characterCount,
    tokenCount,
    collisionCount,
    documentsWithCollision,
    collisionsPerMillionTokens: ratePerMillion(collisionCount, tokenCount),
    sourceCounts: Object.freeze(
      [...sourceTotals.values()].sort(
        (left, right) => right.count - left.count || left.source.localeCompare(right.source),
      ),
    ),
    documents: Object.freeze(analyses),
  });
}
