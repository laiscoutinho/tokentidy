# O comando `check`

> 🇺🇸 Para ler este arquivo em inglês, [clique aqui](../check.md).

O `check` analisa o projeto e lista os **valores fixos no código** (*hardcoded*): valores visuais escritos direto no código em vez de usar um token. Ele nunca altera um arquivo.

```bash
npx tokentidy check                           # pasta atual
npx tokentidy check src/components            # uma pasta
npx tokentidy check src/Card.css src/App.tsx  # arquivos específicos
npx tokentidy check ~/projetos/app            # caminho absoluto
```

## Lendo o resultado

Cada linha é um valor, com cinco campos separados por tabulação:

```
src/App.jsx:29:28	violation	color/hardcoded	color	#4f46e5
src/App.jsx:29:72	violation	font-weight/hardcoded	font-weight	bold
src/App.jsx:31:12	review	size/no-context	width	120
src/App.scss:8:8	violation	spacing/hardcoded	gap	10px
```

| Campo | Exemplo | Significado |
|---|---|---|
| Posição | `src/App.jsx:29:28` | Arquivo, linha e coluna (as duas começam em 1). O terminal e o VS Code transformam isso em link clicável |
| Severidade | `violation` | `violation` (violação): deveria ser um token. `review` (revisão): precisa de uma decisão humana |
| Regra | `color/hardcoded` | O que foi encontrado ([Regras](rules.md)) |
| Propriedade | `color` | Sempre na forma do CSS (`margin-bottom`), mesmo quando escrita `marginBottom` no JSX |
| Valor | `#4f46e5` | O valor como foi escrito |

O caminho é relativo à pasta onde você rodou o comando. O resumo vai para a saída de erro, para os dados continuarem limpos para scripts:

```
57 violations, 9 review in 3 files; 3 ignored by comment; 1 file skipped
```

Violações fazem o `check` terminar com código de saída `1`; itens de revisão nunca fazem ([Códigos de saída](exit-codes.md)).

## Onde ele procura

| Host | Arquivos | O que é lido |
|---|---|---|
| `css` | `.css`, `<style>` em `.html` | toda declaração |
| `scss` | `.scss`, `styles:` do Angular | toda declaração; `$variáveis` são tokens |
| `sass` | `.sass` (sintaxe indentada) | toda declaração; `$variáveis` são tokens |
| `less` | `.less` | toda declaração; `@variáveis` são tokens, chamadas de mixin são puladas |
| `html` | `.html` | `style="..."` inline |
| `jsx` | `.jsx`, `.tsx`, `.js`, `.ts` | `style={{ ... }}` (camelCase, e números como px: `padding: 8`) |
| `angular-template` | `template:` do Angular e o `.html` do `templateUrl` | `style="..."`, `[style.padding.px]="4"`, `[ngStyle]="{...}"` |

Arquivos `.pcss`/`.postcss` são lidos como CSS. Arquivos de tokens (`*.tokens.json`) são lidos como os tokens que o projeto já tem, não como código.

## O que ele pula

Dentro de pastas, ele pula `node_modules`, `dist`, `build`, `.git`, `coverage`, `.angular`, `.next`, `.nuxt`, `out`, pastas ocultas, pastas que são links simbólicos, e arquivos `.d.ts`, `*.spec.*`, `*.test.*` e `*.stories.*`.

**Arquivos são listados, nunca descartados em silêncio.** Arquivos minificados (com nome `*.min.*`, ou com linha média maior que 110 caracteres) e linguagens que o TokenTidy ainda não lê (`.vue`, `.svelte`, `.styl`, `.stylus`) aparecem na saída de erro:

```
src/App.vue	skipped	unsupported
```

Para analisar também os minificados, use `"includeMinified": true`; para pular arquivos ou pastas seus, use `ignore` ([Configuração](configuration.md)). Para aceitar um valor de propósito, use um [comentário de ignore](ignore-comments.md).

## Raiz do projeto

Os caminhos podem ser arquivos ou pastas. O TokenTidy encontra a **raiz do projeto**: a pasta mais próxima acima deles que tenha `package.json`, `tokentidy.config.json` ou `.git`. A configuração é lida de lá.

- Um arquivo passado pelo nome é analisado mesmo que a varredura de uma pasta o pulasse (`Button.test.tsx`).
- Um caminho que não existe para com `Error: Path not found: <path>` e código de saída `2`.
- Um caminho sem nada para analisar mostra `No supported files in <path>` e termina com `0`.

## Arquivos com erro

Um arquivo com erro de sintaxe é informado na saída de erro, e os outros arquivos continuam sendo analisados:

```
src/broken.css:2:14	syntax error	Missed semicolon
```

## Saída segura

Valores, caminhos e mensagens na saída em texto têm caracteres de controle escapados (`\u001b`), então um arquivo não consegue mover o cursor nem falsificar um link no seu terminal. O `--json` mantém o texto exato.

## Opções

| Opção | O que faz |
|---|---|
| `--json` | Mostra o resultado em JSON ([Saída JSON](json-output.md)) |
| `--config <file>` | Arquivo de configuração (padrão: `tokentidy.config.json` na raiz do projeto) |

## Veja também

- [Regras](rules.md): o que cada regra quer dizer e o que não é informado
- [Scripts e CI](ci-and-scripts.md): filtrar o resultado e fazer um build falhar
