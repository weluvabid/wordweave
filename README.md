# WordWeave

Ever tried to say something in a game chat, only for the filter to turn it into a row of `#####`? WordWeave started with that familiar frustration: the idea of communicating on a restrictive platform such as Roblox when the words you want to send don't make it through directly.

The first thought was simple: instead of sending a restricted term as-is, what if it could be represented by an ordinary-looking phrase? Not a string of symbols, not a spelling full of inserted characters, but something that looks like it belongs in a normal conversation.

That's what WordWeave explores. It is an experimental, deterministic text codec that maps a fixed set of source terms to reserved four-word phrases while preserving punctuation, whitespace, and letter casing. Someone using the same vocabulary can decode the result. It is not encryption: the vocabulary is public and the mapping is reversible.

## Why ordinary words?

There are plenty of conventional ways to alter text. A message could replace characters with symbols, insert separators between letters, use unusual character combinations, or introduce custom delimiters and escape sequences. These approaches can work, but they also introduce visible patterns and extra parsing rules. Symbols and deliberately distorted spellings may resemble familiar obfuscation patterns to a filter; inserted characters and delimiters can also be affected by normalization or message processing.

WordWeave takes a different approach: make the encoded representation look like ordinary language. Its reserved phrases are made from carefully selected words, not arbitrary combinations. The vocabulary is constructed with entropy in mind, aiming to make accidental appearances in everyday writing exceptionally unlikely while keeping the output readable as a phrase.

That choice is particularly relevant to the original game-chat idea. In practical use on a restrictive platform, ordinary-looking phrases have a better chance of blending into the surrounding conversation than conspicuous symbol-heavy substitutions. WordWeave has also been tried directly in a platform environment over a considerable period without encountering a block.

## The mathematics behind four words

Each position in a reserved phrase draws from its own set of **64 carefully selected words**. With four positions, the number of distinct ordered combinations available is:

\[
64^4 = 16,777,216
\]

In an ideal model where every word at a position is equally likely, 64 choices provide 6 bits of information per position. Four positions therefore provide **24 bits of combinatorial capacity**.

Why four words instead of three? The comparison makes the trade-off clear:

| Phrase length | Available combinations | Ideal capacity |
| ------------- | ---------------------: | -------------: |
| 3 words       |         64^3 = 262,144 |        18 bits |
| **4 words**   |  **64^4 = 16,777,216** |    **24 bits** |

That fourth position expands the available phrase space by **64 times**. With 64 source terms mapped to 64 reserved phrases, a simplified uniform-choice model gives a reserved-phrase match rate of 64 / 64^3 (1 in 4,096) for three-word phrases, compared with 64 / 64^4 (1 in 262,144) for four-word phrases. In that model, four words provide 64 times more room around the same number of reserved phrases.

This is a comparison of the combinatorial design space. The actual vocabulary is selected with entropy and natural-language appearance in mind, and the corpus scanner gives us a practical way to test how those phrases behave in real text.

## Collision analysis

Carefully choosing the words is only part of the work; I also wanted to see how the reserved phrases behaved against real text. The repository includes a corpus scanner that checks documents independently, so a phrase cannot form across file boundaries.

The current checked-in corpus contains **135 documents and 643,164 tokens** across three collections:

- **Technical documentation:** 57 documents, 304,581 tokens.
- **Literature:** 4 documents, 334,147 tokens.
- **Conversations:** 74 documents, 4,436 tokens, including Ubuntu troubleshooting conversations and daily-conversation samples.

The current analysis detected **zero reserved-phrase collisions** across this corpus. That's a great result for the vocabulary I've built and the material I've tested.

```sh
npm install
npm run check
npm run analyze:collisions -- ./corpus
npm run analyze:collisions -- ./corpus --json ./collision-report.json
```

## Library API

```ts
import { decode, encode, findCodewordCollisions } from "wordweave";

const encoded = encode("Fuck this, please.");
const original = decode(encoded);
const collisions = findCodewordCollisions("A naturally occurring reserved phrase");
```

`findCodewordCollisions` reports reserved phrases in ordinary text, with `start` and `end` offsets measured in JavaScript UTF-16 code units. A collision matters because `decode` interprets an exact reserved phrase as encoded content. Consequently, `decode(encode(text)) === text` is guaranteed only when the input contains no reserved codeword collision.

The vocabulary is versioned. Encoded data should carry or otherwise agree on `VOCABULARY_VERSION`; changing the mapping changes the protocol.

## Development

Requires Node.js 22 or newer and npm 10 or newer.

```sh
npm run check
```

This runs formatting checks, ESLint, TypeScript, tests, and a production build.
