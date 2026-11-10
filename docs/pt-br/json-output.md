# Saída JSON

> 🇺🇸 Para ler este arquivo em inglês, [clique aqui](../json-output.md).

Com `--json`, cada comando mostra o resultado como um objeto JSON, para outro programa ler (um script, uma etapa de CI, outra ferramenta). Enquanto o TokenTidy estiver na versão `0.x`, o formato pode mudar.

Toda saída `--json` começa com `schemaVersion` (hoje `1`). O número sobe quando um campo muda ou sai; um campo novo não muda a versão.

## `check --json`

```json
{
  "schemaVersion": 1,
  "root": "/home/voce/todo-list-react",
  "filesAnalyzed": 7,
  "partial": false,
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
      "selector": "h1",
      "suggestion": { "token": "--color-primary", "match": "exact" }
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
  "tokenFiles": [],
  "repeatedWithoutToken": [],
  "unusedTokens": []
}
```

| Campo | Significado |
|---|---|
| `root` | A raiz do projeto |
| `partial` | `true` quando só parte do projeto foi pedida: definições e usos continuam cobrindo o projeto inteiro |
| `findings` | As violações. `file` é relativo a `root` e sempre usa `/`, também no Windows |
| `suggestion` | Opcional, em um achado: `token`, `match` (`exact` ou `near`), `distance` em `near` (diferença em px, ou ΔEOK nas cores), `alternatives` em um empate ([check](check.md#qual-token-serve)) |
| `offset`, `endOffset` | O trecho exato do valor no arquivo (começando em 0, fim não incluído) |
| `host` | Onde o valor foi escrito: `css`, `scss`, `sass`, `less`, `html`, `jsx`, `angular-template`, `css-in-js`, `js-value`, `svg-attribute` |
| `selector` | O seletor CSS, ou `tag.classe` para estilos inline |
| `atRules`, `function`, `impliedUnit` | Opcionais: as at-rules em volta da regra (`@media (...)`), a função em volta do valor (`darken`), a unidade implícita no código (`px` para `padding: 8` no JSX, `rem` para `[style.gap.rem]`) |
| `review` | Itens de revisão: os mesmos campos de uma violação, mais `message` |
| `ignored` | Quantos valores os comentários de ignore removeram |
| `errors` | Arquivos com erro de sintaxe (`file`, `line`, `column`, `message`) |
| `warnings` | Problemas em comentários de ignore e [avisos sobre tokens](check.md#avisos-sobre-tokens) (`file`, `line`, `column`, `rule`, `message`) |
| `skipped` | Arquivos não analisados (`file`, `reason`: `minified`, `unsupported`, `ignored`) |
| `unmatched` | Caminhos sem nada para analisar |
| `definitions`, `references` | Os tokens que o projeto já define, e onde ele os usa |
| `tokenFiles` | Arquivos dedicados a tokens |
| `repeatedWithoutToken` | Valores que o `generate` transformaria em token e que não têm nenhum: a pasta de tokens está desatualizada. Vazio sem tokens |
| `unusedTokens` | Custom properties que ninguém usa (`name`, `file`, `line`). Vazio em execução parcial |
| `baselined` | Com `--baseline`: quantas violações o baseline cobriu |
| `summary` | Com `--summary`: um item por tipo de token (`type`, `hardcoded`, `tokenized`) |
| `microFrontends` | Com dois ou mais apps ([Micro-frontends](micro-frontends.md)): `projects` (`name`, `dir`) e `issues` (`rule`, `severity`, `file`, `line`, `column`, `property`, `value`, `detail`) |
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
| `consolidated` | Os grupos da [consolidação](generate.md#valores-próximos-consolidação): `id`, `type`, `label`, `to`, `from` (`key`, `count`), `applied` (quantos usos foram juntados), `blocked` (`file`, `line`, `value`, `guard`, `reason`), `kept` (relações que continuam valendo) |
| `themes` | Tokens semânticos com um valor por modo ([Temas](themes.md)): `path`, `light`, `dark` |
| `rootFontSize`, `errors`, `warnings`, `skipped` | Como no `check` |

## `fix --json`

| Campo | Significado |
|---|---|
| `root`, `dryRun` | Como acima |
| `files` | Cada arquivo alterado, com as `replacements` (`line`, `column`, `type`, `property`, `value`, `token`, `source`, `text`, `reason`, e `definedAt`/`alternatives` quando se aplicam) e, com `--dry-run`, o `diff` |
| `skippedValues` | Valores não trocados, com o motivo ([fix](fix.md#valores-que-ele-pula)); `alternatives` lista os tokens empatados |
| `withoutToken` | Valores sem token de mesmo valor |
| `repeatedWithoutToken` | A parte deles que o `generate` transformaria em token: a pasta de tokens está desatualizada |
| `approximate` | Com `--approximate`: cada grupo com `id`, `type`, `label`, `to`, `token`, `status` (`applied`, `rejected`, `pending`, `blocked`), `from`, `changes`, `blocked`, `kept` |
| `remaining` | Violações que sobraram depois da correção |
| `errors`, `warnings`, `skipped` | Como no `check` |

## `generate --shared --json`

Um formato diferente, uma entrada por pasta gravada ([Micro-frontends](micro-frontends.md#um-pacote-de-tokens-compartilhado-generate---shared)):

| Campo | Significado |
|---|---|
| `root`, `mode`, `dryRun` | Como no `generate` |
| `targets` | `name` (`shared` ou o app), `dir`, `tokens`, `files` |
| `errors`, `warnings`, `skipped` | Como no `check` |

## `validate --json`

```json
{
  "schemaVersion": 1,
  "root": "/home/you/app",
  "files": ["design-tokens/brand.tokens.json"],
  "problems": [
    { "file": "design-tokens/brand.tokens.json", "path": "/color/link/$value", "rule": "reference/broken", "message": "{color.primery} does not exist" }
  ]
}
```

| Campo | Significado |
|---|---|
| `files` | Arquivos conferidos, relativos a `root`: os encontrados e os que um resolver cita |
| `problems` | `file`, `path` (um JSON pointer dentro do arquivo), `rule` ([validate](validate.md#o-que-ele-confere)), `message` |

## Exemplo: lendo com `jq`

```bash
npx tokentidy check --json | jq '.findings | length'           # quantas violações
npx tokentidy check --json | jq -r '.findings[].value' | sort -u  # cada valor diferente
```
