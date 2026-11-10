# Micro-frontends

> 🇧🇷 To read this file in Brazilian Portuguese, [click here](pt-br/micro-frontends.md).

When several apps share one screen, each one with its own code, the same decision tends to drift apart: one app's card has `16px` of padding and another's `12px`, two apps define `--brand` with different colors and the last one loaded wins. TokenTidy looks at the apps together and points this out.

## How the apps are found

`check` and `generate` treat the project as micro-frontends when there are **at least two** apps:

| How | Example |
|---|---|
| Two or more folders given on the command line, each with a `package.json` | `npx tokentidy check apps/checkout apps/catalog` |
| `workspaces` in the root `package.json` (npm, Yarn, pnpm-style `{ "packages": [...] }`) | `"workspaces": ["apps/*"]` |
| Projects in an Angular `angular.json` with their own `root` | `"projects": { "shell": { "root": "projects/shell" } }` |

An app's name is the `name` in its `package.json`, or its folder name. In `workspaces`, `*` covers one folder level and `!` excludes; `**` isn't expanded.

## What `check` reports

The extra lines come after the usual ones, with a detail column:

```
apps/catalog/a.css:1:9	violation	mfe/root-collision	--brand	#6366f1	same global token, different values: catalog #6366f1, checkout #4f46e5
apps/catalog/a.css:2:18	review	mfe/drift	.card padding	12px	same role, different values: catalog 12px, checkout 16px
apps/catalog/package.json:1:35	review	mfe/version-mismatch	@acme/tokens	^2.0.0	different versions of the design system: catalog ^2.0.0, checkout ^1.2.0
```

| Rule | Severity | When |
|---|---|---|
| `mfe/root-collision` | violation | Two apps define the same global custom property (`:root`/`html`) with different values. On the same page, one overwrites the other. `#FFF` and `white` are the same value |
| `mfe/drift` | review | The same role (token type, property family and component: `.card padding`) has a different most-used value in each app. Tokens are followed to their value |
| `mfe/version-mismatch` | review | The apps depend on different versions of the same design-system package (a name with `tokens`, `design-system`, `ui-kit` or `theme`, or a package that provides tokens) |

A collision makes `check` end with `1`; drift and version differences are for review and never fail. The summary on the error output adds a line:

```
2 micro-frontends: 2 global token collisions, 2 role drifts, 2 design-system version mismatches
```

With `--json`, the result gains `microFrontends: { projects, issues }` ([JSON output](json-output.md#check---json)). With `--format github`, collisions are errors and the rest notices.

## A shared token package: `generate --shared`

```bash
npx tokentidy generate --shared packages/tokens
```

Splits the tokens in two:

- a value used by **two or more apps** (or outside any of them) goes to the shared folder, which works as one package. There, two uses are enough, even if `minOccurrences` is higher;
- a value used by a single app goes to that app's own folder (`<app>/design-tokens`, or `output` in the config).

```
shared	packages/tokens	1
catalog	apps/catalog/design-tokens	1
checkout	apps/checkout/design-tokens	1
```

Each line: name, folder and number of tokens. `--dry-run` and `--json` work as usual. It doesn't ask: it keeps the names generated before in each folder (like `--extend`), unless you pass `--new`. With fewer than two apps, it is a usage error (`2`). Themes aren't split yet: run `generate` without `--shared` for them.

To replace values afterwards, run `fix` per app with the folder of its tokens, for example `npx tokentidy fix apps/checkout --tokens packages/tokens`. Only that app changes; the project root becomes the folder that contains both (here, the repository root), and its config is the one that applies. Imports of the token module and of `_tokens.scss` point to the shared folder with a relative path.
