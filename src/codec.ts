import { VOCABULARY } from "./vocabulary.js";

export interface CodewordCollision {
  readonly start: number;
  readonly end: number;
  readonly codeword: string;
  readonly source: string;
}

const WORD_PATTERN = /[\p{L}\p{M}\p{N}_]+(?:['’-][\p{L}\p{M}\p{N}_]+)*/gu;
const WORD_CHARACTER = String.raw`[\p{L}\p{M}\p{N}_]`;
const SOURCE_TO_CODEWORD = new Map<string, string>(
  VOCABULARY.map(({ source, codeword }) => [source, codeword]),
);
const CODEWORD_TO_SOURCE = new Map<string, string>(
  VOCABULARY.map(({ source, codeword }) => [codeword, source]),
);
const CODEWORD_PATTERN_SOURCE = VOCABULARY.map(({ codeword }) => escapeRegExp(codeword))
  .sort((left, right) => right.length - left.length)
  .join("|");

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertText(input: string): void {
  if (typeof input !== "string") {
    throw new TypeError("WordWeave input must be a string");
  }
}

function createCodewordPattern(): RegExp {
  return new RegExp(
    `(?<!${WORD_CHARACTER})(?<!${WORD_CHARACTER}['’-])(?:${CODEWORD_PATTERN_SOURCE})(?!${WORD_CHARACTER})(?!['’-]${WORD_CHARACTER})`,
    "giu",
  );
}

function isUppercaseLetter(value: string): boolean {
  return value === value.toUpperCase() && value !== value.toLowerCase();
}

function isTitleCase(value: string): boolean {
  const first = value[0];

  return first !== undefined && `${first.toUpperCase()}${value.slice(1).toLowerCase()}` === value;
}

function applyCasePattern(source: string, codeword: string): string {
  if (source === source.toLowerCase()) {
    return codeword;
  }

  if (source === source.toUpperCase()) {
    return codeword.toUpperCase();
  }

  if (isTitleCase(source)) {
    const first = codeword[0];

    return first === undefined ? codeword : `${first.toUpperCase()}${codeword.slice(1)}`;
  }

  let sourceIndex = 0;

  return codeword.replace(/[a-z]/g, (letter) => {
    if (sourceIndex >= source.length) {
      return letter;
    }

    const sourceLetter = source[sourceIndex];
    sourceIndex += 1;

    if (sourceLetter === undefined) {
      return letter;
    }

    return isUppercaseLetter(sourceLetter) ? letter.toUpperCase() : letter;
  });
}

function restoreCase(source: string, codeword: string): string {
  if (codeword === codeword.toLowerCase()) {
    return source;
  }

  if (codeword === codeword.toUpperCase()) {
    return source.toUpperCase();
  }

  if (isTitleCase(codeword)) {
    const first = source[0];

    return first === undefined ? source : `${first.toUpperCase()}${source.slice(1)}`;
  }

  const encodedLetters = codeword.match(/[a-z]/gi) ?? [];

  return [...source]
    .map((letter, index) => {
      const encodedLetter = encodedLetters[index];

      return encodedLetter !== undefined && isUppercaseLetter(encodedLetter)
        ? letter.toUpperCase()
        : letter;
    })
    .join("");
}

export function encode(input: string): string {
  assertText(input);

  return input.replace(WORD_PATTERN, (token) => {
    const codeword = SOURCE_TO_CODEWORD.get(token.toLowerCase());

    return codeword === undefined ? token : applyCasePattern(token, codeword);
  });
}

export function decode(input: string): string {
  assertText(input);

  return input.replace(createCodewordPattern(), (matched) => {
    const source = CODEWORD_TO_SOURCE.get(matched.toLowerCase());

    return source === undefined ? matched : restoreCase(source, matched);
  });
}

export function findCodewordCollisions(input: string): readonly CodewordCollision[] {
  assertText(input);

  const collisions: CodewordCollision[] = [];
  const pattern = createCodewordPattern();
  let match = pattern.exec(input);

  while (match !== null) {
    const codeword = match[0];
    const source = CODEWORD_TO_SOURCE.get(codeword.toLowerCase());

    if (source !== undefined) {
      collisions.push(
        Object.freeze({
          start: match.index,
          end: match.index + codeword.length,
          codeword,
          source,
        }),
      );
    }

    match = pattern.exec(input);
  }

  return Object.freeze(collisions);
}
