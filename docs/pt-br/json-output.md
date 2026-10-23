# Saída JSON

> 🇺🇸 Para ler este arquivo em inglês, [clique aqui](../json-output.md).

Com `--json`, cada comando mostra o resultado como um objeto JSON, para outro programa ler (um script, uma etapa de CI, outra ferramenta). Enquanto o TokenTidy estiver na versão `0.x`, o formato pode mudar.

## `check --json`

```json
{
  "root": "/home/voce/todo-list-react",
  "filesAnalyzed": 7,
  "findings": [
    {
      "file": "src/App.jsx",
      "line": 29,
      "column": 28,
      "offset": 795,
      "endOffset": 802,
      "type": "color",
      "rule": "color/hardcoded",
      "property": "color",
      "value": "#4f46e5",
      "host": "jsx",
      "selector": "h1"
    }
  ],
  "review": [{ "file": "src/App.jsx", "line": 31, "column": 12, "type": "size", "rule": "size/no-context", "property": "width", "value": "120", "message": "size without context: …" }],
  "ignored": 0,
  "errors": [],
  "warnings": [],
  "skipped": [{ "file": "src/App.vue", "reason": "unsupported" }],
  "unmatched": [],
  "definitions": [{ "name": "$roxo", "syntax": "scss-variable", "value": "#4f46e5", "file": "src/App.scss", "line": 2, "column": 1 }],
  "references": [{ "name": "$roxo", "property": "accent-color", "file": "src/App.scss", "line": 16, "selector": ".tarefa input[type=\"checkbox\"]" }],
  "styleLanguages": ["css", "scss"],
  "tokenFiles": []
}
```

| Campo | Significado |
|---|---|
| `root` | A raiz do projeto |
| `findings` | As violações. `file` é relativo a `root` e sempre usa `/`, também no Windows |
| `offset`, `endOffset` | O trecho exato do valor no arquivo (começando em 0, fim não incluído) |
| `host` | Onde o valor foi escrito: `css`, `scss`, `sass`, `less`, `html`, `jsx`, `angular-template` |
| `selector` | O seletor CSS, ou `tag.classe` para estilos inline |
| `atRules`, `function`, `impliedUnit` | Opcionais: as at-rules em volta da regra (`@media (...)`), a função em volta do valor (`darken`), a unidade implícita no código (`px` para `padding: 8` no JSX, `rem` para `[style.gap.rem]`) |
| `review` | Itens de revisão: os mesmos campos de uma violação, mais `message` |
| `ignored` | Quantos valores os comentários de ignore removeram |
| `errors` | Arquivos com erro de sintaxe (`file`, `line`, `column`, `message`) |
| `warnings` | Problemas em comentários de ignore (`file`, `line`, `column`, `rule`, `message`) |
| `skipped` | Arquivos não analisados (`file`, `reason`: `minified`, `unsupported`, `ignored`) |
| `unmatched` | Caminhos sem nada para analisar |
| `definitions`, `references` | Os tokens que o projeto já define, e onde ele os usa |
| `tokenFiles` | Arquivos dedicados a tokens |
| `rootFontSize` | Presente quando o projeto define `html { font-size }` |

## `generate --json`

| Campo | Significado |
|---|---|
| `root`, `filesAnalyzed` | Como no `check` |
| `mode` | `extend` ou `new` |
| `config` | As configurações em uso |
| `dryRun` | Se arquivos foram gravados |
| `files` | Caminhos gravados, ou que seriam gravados |
| `tokens` | Cada um com `path`, `name`, `type`, `key`, `value`, `count`, `spellings`, `occurrences`, e `equivalents`/`kept` quando se aplicam |
| `aliases` | Aliases semânticos |
| `reused` | Valores que já tinham token no projeto |
| `belowThreshold` | Valores usados menos vezes que o limite, com as ocorrências |
| `suggestions` | `kind`, `type`, `message`, `values` |
| `diagnosis` | `type`, `distinct`, `steps`, `uses`, `onStep`, `consistency` (0–1), `singleUse`, `reference` |
| `rootFontSize`, `errors`, `warnings`, `skipped` | Como no `check` |

## `fix --json`

| Campo | Significado |
|---|---|
| `root`, `dryRun` | Como acima |
| `files` | Cada arquivo alterado, com as `replacements` (`line`, `column`, `type`, `property`, `value`, `token`, `source`, `text`) e, com `--dry-run`, o `diff` |
| `skippedValues` | Valores não trocados, com o motivo ([fix](fix.md#valores-que-ele-pula)) |
| `withoutToken` | Valores sem token de mesmo valor |
| `remaining` | Violações que sobraram depois da correção |
| `errors`, `warnings`, `skipped` | Como no `check` |

## Exemplo: lendo com `jq`

```bash
npx tokentidy check --json | jq '.findings | length'           # quantas violações
npx tokentidy check --json | jq -r '.findings[].value' | sort -u  # cada valor diferente
```
