# Ignore comments

> 🇧🇷 To read this file in Brazilian Portuguese, [click here](pt-br/ignore-comments.md).

Sometimes a hardcoded value is intentional: a partner's brand color, a fix for one browser. An **ignore comment** tells TokenTidy to accept it, saying **which rule** and **why**.

## Writing one

Use the comment syntax of the file:

```css
.partner { color: #e4002b; } /* tokentidy-ignore-line color/hardcoded -- partner brand color */

/* tokentidy-ignore-next-line spacing/hardcoded, radius/hardcoded -- matches the legacy widget */
.legacy { padding: 7px; border-radius: 3px; }
```

| Directive | Ignores |
|---|---|
| `tokentidy-ignore-line` | Values on the same line as the comment |
| `tokentidy-ignore-next-line` | Values on the line below the comment |

After the directive come one or more [rule ids](rules.md), separated by commas. Then, optional but recommended, ` -- ` and the reason, so the next person knows why. `//` (SCSS, Less, JS), `<!-- -->` (HTML) and `{/* */}` (JSX) work too.

## Rules are required

A bare `tokentidy-ignore-line` ignores nothing: ignoring "everything" would hide more than you meant. TokenTidy warns about it, and about other mistakes, on the error output:

```
src/App.css:12:3	warning	ignore/too-broad	…
```

| Warning | Meaning |
|---|---|
| `ignore/too-broad` | No rule id: nothing was ignored |
| `ignore/unknown-rule` | The rule id doesn't exist (a typo?) |
| `ignore/unused` | Nothing on that line matches the rule: the comment can go |

Warnings never change the exit code.

## Ignoring whole files or folders

For generated code, vendored libraries or legacy folders, use `ignore` in the config instead of comments:

```json
{
  "ignore": ["legacy/**", "**/*.generated.css"]
}
```

See [Configuration](configuration.md). Ignored files are listed as skipped, with the reason `ignored`.
