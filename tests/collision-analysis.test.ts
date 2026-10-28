import { describe, expect, it } from "vitest";
import { analyzeCorpus, analyzeCorpusCollection } from "../src/collision-analysis.js";
import { VOCABULARY } from "../src/vocabulary.js";

describe("corpus collision analysis", () => {
  const first = VOCABULARY[0];

  if (first === undefined) {
    throw new Error("Expected a source vocabulary entry");
  }

  it("counts exact reserved codewords and reports a normalized per-million rate", () => {
    const result = analyzeCorpus("fixture", `one two three four five ${first.codeword}.`);

    expect(result.label).toBe("fixture");
    expect(result.tokenCount).toBe(9);
    expect(result.collisionCount).toBe(1);
    expect(result.documentsWithCollision).toBe(1);
    expect(result.collisionsPerMillionTokens).toBeCloseTo(1_000_000 / 9);
    expect(result.sourceCounts).toEqual([
      { source: first.source, codeword: first.codeword, count: 1 },
    ]);
  });

  it("does not count codewords embedded inside larger tokens", () => {
    const result = analyzeCorpus("fixture", `x${first.codeword} y-${first.codeword}z`);

    expect(result.collisionCount).toBe(0);
  });

  it("returns zero rates for empty or collision-free corpora", () => {
    expect(analyzeCorpus("empty", "").collisionsPerMillionTokens).toBe(0);
    expect(analyzeCorpus("plain", "just ordinary text").collisionsPerMillionTokens).toBe(0);
  });

  it("aggregates document metrics and source frequencies without joining document boundaries", () => {
    const second = VOCABULARY[1];

    if (second === undefined) {
      throw new Error("Expected a second source vocabulary entry");
    }

    const result = analyzeCorpusCollection([
      { label: "a", text: first.codeword },
      { label: "b", text: `plain text ${second.codeword}` },
      { label: "c", text: "ordinary words only" },
    ]);

    expect(result.documentCount).toBe(3);
    expect(result.tokenCount).toBe(13);
    expect(result.collisionCount).toBe(2);
    expect(result.documentsWithCollision).toBe(2);
    expect(result.sourceCounts.map(({ source, count }) => ({ source, count }))).toEqual([
      { source: first.source, count: 1 },
      { source: second.source, count: 1 },
    ]);
  });

  it("freezes analysis results and rejects malformed inputs", () => {
    const result = analyzeCorpusCollection([{ label: "a", text: "plain text" }]);

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.documents)).toBe(true);
    expect(() => analyzeCorpus(1 as never, "text")).toThrow(TypeError);
    expect(() => analyzeCorpusCollection(null as never)).toThrow(TypeError);
  });
});
