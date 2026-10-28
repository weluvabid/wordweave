import { describe, expect, it } from "vitest";
import {
  decode,
  encode,
  findCodewordCollisions,
  CODEWORD_COUNT,
  CODEWORD_SPACE_BITS,
  CODEWORD_SPACE_SIZE,
  CODEWORD_WORD_COUNT,
  REPLACEMENT_WORDS,
  REPLACEMENT_WORDS_PER_POSITION,
  UNIFORM_CODEWORD_COLLISION_PROBABILITY,
  VOCABULARY,
  VOCABULARY_VERSION,
} from "../src";

const collisionFreeMessages = [
  "",
  "   ",
  "Hey, fuck you mate!",
  "Fuck you, FUCK YOU, and fUcK you.",
  "motherfucker, fucker, and fuck.",
  "line one\nshit\tline two",
  "Unicode: café 東京 🙂 — damn!",
  "Right-to-left: שלום; combining: e\u0301; emoji: 👩🏽‍💻",
  'Quotes: ‘fuck’, "shit", (damn), [hell].',
];

describe("WordWeave codec", () => {
  it("exposes a stable versioned vocabulary", () => {
    expect(VOCABULARY_VERSION).toBe(1);
    expect(VOCABULARY).toHaveLength(64);
    expect(CODEWORD_COUNT).toBe(64);
    expect(REPLACEMENT_WORDS_PER_POSITION).toBe(64);
    expect(REPLACEMENT_WORDS).toHaveLength(256);
    expect(new Set(REPLACEMENT_WORDS).size).toBe(256);
    expect(CODEWORD_WORD_COUNT).toBe(4);
    expect(CODEWORD_SPACE_SIZE).toBe(16_777_216);
    expect(CODEWORD_SPACE_BITS).toBe(24);
    expect(UNIFORM_CODEWORD_COLLISION_PROBABILITY).toBe(1 / 262_144);
    expect(new Set(VOCABULARY.map(({ source }) => source)).size).toBe(64);
    expect(new Set(VOCABULARY.map(({ codeword }) => codeword)).size).toBe(64);
    expect(VOCABULARY.every(({ codeword }) => codeword.split(" ").length === 4)).toBe(true);

    for (let position = 0; position < CODEWORD_WORD_COUNT; position += 1) {
      expect(new Set(VOCABULARY.map(({ codeword }) => codeword.split(" ")[position])).size).toBe(
        REPLACEMENT_WORDS_PER_POSITION,
      );
    }
  });

  it.each(collisionFreeMessages)("round-trips %j", (input) => {
    expect(decode(encode(input))).toBe(input);
  });

  it("transforms every configured source word", () => {
    for (const { source, codeword } of VOCABULARY) {
      const encoded = encode(source);

      expect(encoded.toLowerCase()).toBe(codeword);
      expect(decode(encoded)).toBe(source);
    }
  });

  it("preserves lowercase, title case, uppercase, and arbitrary mixed case", () => {
    for (const input of ["fuck", "Fuck", "FUCK", "fUcK", "fUCK", "FuCk"]) {
      expect(decode(encode(input))).toBe(input);
    }
  });

  it("preserves surrounding punctuation and whitespace byte-for-byte", () => {
    const input = "\t( Fuck! )  \nshit...\r\n";

    expect(decode(encode(input))).toBe(input);
  });

  it("does not replace substrings inside larger tokens", () => {
    const input = "class assess assessment firetruck shitake unfuckable";

    expect(encode(input)).toBe(input);
  });

  it("does not replace apostrophe-, hyphen-, or underscore-connected tokens", () => {
    const input = "fuck's fuck-off fuck_word 1fuck fuck2 éfuck";

    expect(encode(input)).toBe(input);
  });

  it("leaves unknown words and unrecognized code-like phrases unchanged", () => {
    const input = "hello, friend — this is ordinary text.";

    expect(encode(input)).toBe(input);
    expect(decode(input)).toBe(input);
    expect(decode("velvet orbit unknown")).toBe("velvet orbit unknown");
  });

  it("rejects non-string runtime inputs", () => {
    expect(() => encode(null as unknown as string)).toThrow(TypeError);
    expect(() => decode(undefined as unknown as string)).toThrow(TypeError);
    expect(() => findCodewordCollisions(42 as unknown as string)).toThrow(TypeError);
  });

  it("encodes and decodes repeated source words independently", () => {
    const input = "fuck fuck fuck!";
    const encoded = encode(input);

    expect(encoded).toBe(
      "velvet orbit quiet maple velvet orbit quiet maple velvet orbit quiet maple!",
    );
    expect(decode(encoded)).toBe(input);
  });

  it("is deterministic", () => {
    const input = "Hey, Fuck you mate!";

    expect(encode(input)).toBe(encode(input));
    expect(decode(encode(input))).toBe(decode(encode(input)));
  });

  it("reports naturally occurring codeword phrases before encoding", () => {
    expect(
      findCodewordCollisions("A velvet orbit quiet maple, then SILVER CIRCLE GLASS ECHO."),
    ).toEqual([
      { start: 2, end: 26, codeword: "velvet orbit quiet maple", source: "fuck" },
      { start: 33, end: 57, codeword: "SILVER CIRCLE GLASS ECHO", source: "fucking" },
    ]);
  });

  it("documents the accepted natural-language collision behavior", () => {
    const ordinaryText = "We saw a velvet orbit quiet maple in the poem.";

    expect(encode(ordinaryText)).toBe(ordinaryText);
    expect(decode(ordinaryText)).not.toBe(ordinaryText);
    expect(findCodewordCollisions(ordinaryText)).toHaveLength(1);
  });

  it("does not detect codewords embedded in larger words or hyphenated compounds", () => {
    expect(
      findCodewordCollisions(
        "xvelvet orbit quiet maple velvet orbit quiet maplex velvet-orbit quiet maple",
      ),
    ).toEqual([]);
  });

  it("handles lone UTF-16 surrogates without throwing or changing them", () => {
    const input = `before \uD800 fuck \uDC00 after`;

    expect(decode(encode(input))).toBe(input);
  });

  it("handles large inputs and long near-matches", () => {
    const input = `${"ordinary text ".repeat(10_000)}${"velvet orbit maplex ".repeat(1_000)}fuck`;
    const encoded = encode(input);

    expect(decode(encoded)).toBe(input);
    const nearMatch = `velvet orbit quiet maple${"x".repeat(100_000)}`;

    expect(decode(nearMatch)).toBe(nearMatch);
  });
});
