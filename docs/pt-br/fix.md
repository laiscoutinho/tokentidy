# O comando `fix`

> 🇺🇸 Para ler este arquivo em inglês, [clique aqui](../fix.md).

O `fix` troca cada valor fixo no código por um token de **exatamente o mesmo valor**. Valores sem um token assim ficam como estão e são contados. Valores só *próximos* de um token (`15px` e um token de `16px`) nunca são tocados.

```bash
npx tokentidy fix --dry-run                     # mostra um diff, sem gravar nada
npx tokentidy fix                               # grava os arquivos e mostra os caminhos alterados
npx tokentidy fix src/components --tokens tokens/
```

Sempre comece com `--dry-run`: ele mostra um diff unificado (o mesmo formato do `git diff`, que o `git apply` aceita), então você vê cada mudança antes de ela acontecer.

Se o projeto não tem nenhum token, o `fix` pede para rodar o [`generate`](generate.md) antes.

## Qual token é usado

Nesta ordem:

1. um **alias semântico** gerado (`--color-text-danger`), só onde ele foi criado;
2. um **token escrito à mão** no projeto: uma custom property global (`:root`/`html`/`body`, nunca redefinida com outro valor por um tema ou media query), ou um `$x`/`@x` de nível superior visível no arquivo (no mesmo arquivo, ou em um arquivo que ele carrega com `@import`/`@use … as *`). Entre dois, vence o mais usado;
3. um **token gerado** da pasta de tokens (`design-tokens/`, ou `output` na configuração), quando o arquivo dele existe: `tokens.css` para `var()`, `_tokens.scss` para `$x`, `_tokens.less` para `@x`.

## Como o token é escrito

| Onde | Escrito como |
|---|---|
| CSS, `style=""` do HTML, `style=""` do Angular, valores simples em SCSS/Less, `calc()`, gradientes, `color-mix()` | `var(--nome)` |
| SCSS/Sass/Less dentro de outra função (`darken`, `math.div`), ao lado de `* / + % -`, ou em `@media` | `$nome` / `@nome`. Um token gerado vem com `@use '<caminho>/tokens' as *;` (Sass: sem `;`) ou `@import (reference) '<caminho>/_tokens.less';` |
| Número no JSX (`padding: 16`) | `'var(--nome)'`, com o tipo de aspas que o arquivo mais usa |
| String no JSX (`'8px 16px'`) | `'8px var(--nome)'` |
| Angular `[style.padding.px]="16"` / `{'gap.px': 16}` | `[style.padding]="'var(--nome)'"` / `{'gap': 'var(--nome)'}` |

## Valores que ele pula

Valores pulados aparecem na saída de erro, com o motivo:

```
src/App.scss:12:10	skipped	needs-preprocessor-variable	16px	…
```

| Motivo | Quando |
|---|---|
| `needs-preprocessor-variable` | O Sass/Less precisa do valor na hora do build e não há um `$x`/`@x` com ele disponível |
| `inline-style-function` | O mesmo, em um `styles:` inline do Angular (ele não consegue importar variáveis Sass) |
| `variable-not-loaded` | O arquivo de tokens é carregado com namespace (`@use … as t`), ou existe uma variável com o valor mas ela não é importada |
| `unit-in-binding` | `[style.width.px]="a ? 16 : 24"`: a unidade no nome vale para os dois valores |
| `overlap` | Duas trocas no mesmo trecho de texto |
| `breaks-syntax` | O arquivo corrigido teria um erro de sintaxe (ele é analisado de novo em memória antes de gravar) |
| `changed-on-disk` | O arquivo mudou enquanto o comando rodava |
| `symlink`, `outside-root` | O arquivo é um link simbólico ou aponta para fora do projeto |

## Segurança

- Arquivos dentro da pasta de tokens nunca são editados.
- Cada arquivo é lido de novo logo antes de gravar, e gravado de forma atômica, mantendo as permissões.
- As edições são feitas por posição: quebras de linha, BOM e o resto do arquivo ficam como estavam.

## Resumo

Na saída de erro:

```
12 values replaced in 4 files; 1 skipped; 9 without a token; 10 violations remain
```

Quando tokens gerados foram escritos como `var()`, ele também lembra que o app precisa carregar `design-tokens/tokens.css`.

## Opções

| Opção | O que faz |
|---|---|
| `--tokens <dir>` | Pasta com os tokens gerados (padrão: `output` da configuração, `design-tokens`) |
| `--config <file>` | Arquivo de configuração (padrão: `tokentidy.config.json` no projeto) |
| `--dry-run` | Mostra um diff unificado em vez de gravar |
| `--json` | Mostra o resultado em JSON ([Saída JSON](json-output.md)) |

## Código de saída

Como o `eslint --fix`: `0` quando não sobram violações nem erros de sintaxe, `1` quando sobram (também com `--dry-run`, contando como se a correção tivesse sido aplicada), `2` para erros de uso. Veja [Códigos de saída](exit-codes.md).
