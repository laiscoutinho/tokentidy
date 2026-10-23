# Code standard

How TokenTidy's own code is written. The project-wide conventions (language, commits, output) are in the [README](../README.md#️-development) and in the dev notes; this file covers the code itself.

## Language

- Everything is in **English**: identifiers, CLI messages, docs, test names and fixtures.
- **Code comments are in Portuguese**, short and objective. A comment says *why*, not what the next line does.

## Comments

- A short comment (one line) uses `//`.
- A longer comment (two lines or more) uses `/** ... */`, never a run of `//` lines.
- Inside a `/** */` comment, don't write the sequence asterisk + slash (it closes the comment early). Describe it in words.

```ts
// Ignora valores com var(): já são tokens
if (hasVar(value)) return;

/**
 * Um valor dentro de uma função do Sass é calculado no build,
 * então só uma variável $x funciona ali.
 */
```

## File size

- A source file in `src/` has **at most about 300 lines**. When it grows past that, split it by responsibility (e.g. `parsers/css/` became `stylesheet.ts`, `values.ts`, `value-tokens.ts`, `font-and-shadow.ts` and `declaration-context.ts`).
- Test files are exempt: one test file per module, however long.

## Names

- Variables, functions and files have **explicit, semantic and unambiguous** names, without becoming long: `findSuggestions`, `renderStylesheet`, `hunkRange`, `skippedValue`.
- Avoid generic names that could mean anything in another module: `visit`, `range`, `round`, `simple`, `skip`.
- File names are kebab-case and say what is inside: `color-family.ts`, `surrounding-syntax.ts`.

## Folders

- When two or more files are about the same subject, they go in a folder (`project/`, `analysis/`, `values/`, `generate/naming/`, `generate/output/`).
- A single file that doesn't belong to any folder may stay loose in `src/` (`types.ts`, `index.ts`, `token-index.ts`, `safe-write.ts`).
- Tests mirror the source folders (`test/fix/fix.test.ts`, `test/values/normalize.test.ts`).

## Compiler checks

`tsconfig.json` enables, besides `strict` and `noUncheckedIndexedAccess`:

- `noUnusedLocals` and `noUnusedParameters`: an unused import, variable or parameter is a type error, so `npm run check` fails. An intentionally unused parameter starts with `_`.
- `erasableSyntaxOnly` and `verbatimModuleSyntax`: only syntax Node can strip (no `enum`, `namespace` or parameter properties), and `import type` for types.

## Before committing

`npm run check` (type checking + tests with the coverage floor) must pass. See [local setup](local-setup.md).
