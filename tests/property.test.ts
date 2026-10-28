import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { decode, encode, findCodewordCollisions, VOCABULARY } from "../src/index.js";

const safeWords = ["hello", "mate", "friend", "world", "café", "東京", "naïve", "🙂"] as const;
const separators = ["", " ", "  ", "\n", "\t", ", ", " — ", "🙂"] as const;
const sourceWords = VOCABULARY.map(({ source }) => source);
const allWords = [...safeWords, ...sourceWords] as [string, ...string[]];
const wordArbitrary = fc.constantFrom(...allWords);
const separatorArbitrary = fc.constantFrom(...separators);

const messageArbitrary = fc
  .array(fc.tuple(wordArbitrary, separatorArbitrary), { maxLength: 80 })
  .map((parts) => parts.map(([word, separator]) => `${word}${separator}`).join(""));

describe("codec properties", () => {
  it("round-trips generated messages without reserved codeword collisions", () => {
    fc.assert(
      fc.property(messageArbitrary, (input) => {
        expect(findCodewordCollisions(input)).toHaveLength(0);
        expect(decode(encode(input))).toBe(input);
      }),
      { numRuns: 1_000 },
    );
  });

  it("round-trips arbitrary Unicode strings when they contain no reserved codeword", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (input) => {
        fc.pre(findCodewordCollisions(input).length === 0);
        expect(decode(encode(input))).toBe(input);
      }),
      { numRuns: 500 },
    );
  });
});
