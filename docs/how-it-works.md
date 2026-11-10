# How it works

> 🇧🇷 To read this file in Brazilian Portuguese, [click here](pt-br/how-it-works.md).

```
  Project code
        │
        ▼
 ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
 │  1. Read the │ ──▶ │ 2. Understand│ ──▶ │ 3. Compare   │
 │  project     │     │ the code(AST)│     │ with tokens  │
 └──────────────┘     └──────────────┘     └──────┬───────┘
                                                  │
                                           ┌──────▼───────┐
                                           │ 4. Report,   │
                                           │ suggest or   │
                                           │ fix          │
                                           └──────────────┘
```

1. **Read the project.** TokenTidy finds the project root, reads the config and lists the files to analyze (see [check](check.md#where-it-looks)).
2. **Understand the code.** Each file is read through its structure (a *syntax tree*), not through text search. That way TokenTidy tells a color apart from text that only looks like one, and knows the exact position of every value.
3. **Compare with tokens.** Each value is written in a single standard form (`#FFF`, `white` and `rgb(255 255 255)` all become `#ffffff`) and compared with the tokens the project already has.
4. **Report, suggest or fix.** [`check`](check.md) lists, [`generate`](generate.md) creates tokens, [`fix`](fix.md) replaces values, editing only the exact slice of each file. [`validate`](validate.md) checks the token files themselves.

## Context

A value alone doesn't say whether it should be a token. TokenTidy looks at **what the value is doing**:

- **The same value can mean different things.** `width: 800px` setting the maximum width of the page content is a layout decision, and a token candidate (`--layout-max-width`). The same `800px` as the width of a card is another decision, and isn't merged with the first just because the number is equal.
- **Different values can mean the same thing.** A `max-width` repeated across page containers with slightly different values is probably one decision written several ways.
- **Context comes from the code itself:** the property, the selector, which declarations sit next to it, and how often the value repeats in the same role.
- **A change may move a value, never a relationship.** Before a close value is replaced, the element is analyzed as a whole: a `:hover` stays different from its base, text keeps its contrast, inner spacing stays smaller than outer spacing, a small button stays smaller than a large one. A change that would break one of these is blocked, with the reason ([coherence guards](fix.md#values-close-to-a-token---approximate)).

## Principles

- Nothing is changed without an explicit request, and `--dry-run` shows changes first. A value that is only close to a token changes only with your authorization.
- Every suggestion comes with a reason.
- The same input always produces the same output.
- A broken file never stops the analysis of the others.
- TokenTidy collects no usage data and sends nothing off your machine.
