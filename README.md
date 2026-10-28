# WordWeave

WordWeave is a deterministic text codec that maps a fixed set of source terms to reserved four-word phrases. It preserves punctuation, whitespace, and letter casing. It is not encryption: the vocabulary is public and the mapping is reversible.

## Library API

```ts
import { decode, encode, findCodewordCollisions } from "wordweave";

const encoded = encode("Fuck this, please.");
const original = decode(encoded);
const collisions = findCodewordCollisions("A naturally occurring reserved phrase");
```

`findCodewordCollisions` reports reserved phrases in ordinary text, with `start` and `end` offsets measured in JavaScript UTF-16 code units. A collision is important because `decode` interprets an exact reserved phrase as encoded content. Consequently, `decode(encode(text)) === text` is guaranteed only when the input contains no reserved codeword collision.

The vocabulary is versioned. Encoded data should carry or otherwise agree on `VOCABULARY_VERSION`; changing the mapping changes the protocol.

## Collision analysis

The repository includes a corpus scanner to measure collisions against real text collections. It scans each document independently, so a phrase cannot form across file boundaries.

```sh
npm install
npm run corpus:fetch
npm run check
npm run analyze:collisions -- ./corpus
npm run analyze:collisions -- ./corpus --json ./collision-report.json
```

## Development

Requires Node.js 22 or newer and npm 10 or newer.

```sh
npm run check
```

This runs formatting checks, ESLint, TypeScript, tests, and a production build.
