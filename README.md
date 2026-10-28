# WordWeave

An experiment in using ordinary words as symbols in a deterministic, reversible text protocol.

The first milestone is a small TypeScript codec. The browser playground will be built around that
core rather than mixing protocol logic into the UI.

## Development

Requires Node.js 22 or newer and npm 10 or newer.

```sh
npm install
npm run dev
```

## Checks

```sh
npm run check
```

This runs formatting checks, ESLint, TypeScript, tests, and a production build.
