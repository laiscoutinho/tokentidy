# O comando `fix`

> 🇺🇸 Para ler este arquivo em inglês, [clique aqui](../fix.md).

O `fix` troca cada valor fixo no código por um token de **exatamente o mesmo valor**. Valores sem um token assim ficam como estão e são contados. Valores só *próximos* de um token (`15px` e um token de `16px`) só mudam com [`--approximate`](#valores-próximos-de-um-token---approximate), e só quando você autoriza.

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
2. um **token escrito à mão** no projeto: uma custom property global (`:root`/`html`/`body`, nunca redefinida com outro valor por um tema ou media query), ou um `$x`/`@x` de nível superior visível no arquivo (no mesmo arquivo, ou em um arquivo que ele carrega com `@import`/`@use … as *`). Entre dois, vence o mais usado, e um empate é pulado como `ambiguous-token`;
3. um **token gerado** da pasta de tokens (`design-tokens/`, ou `output` na configuração), quando o arquivo dele existe: `tokens.css` para `var()`, `_tokens.scss` para `$x`, `_tokens.less` para `@x`.

## Como o token é escrito

| Onde | Escrito como |
|---|---|
| CSS, `style=""` do HTML, `style=""` do Angular, valores simples em SCSS/Less, `calc()`, gradientes, `color-mix()` | `var(--nome)` |
| SCSS/Sass/Less dentro de outra função (`darken`, `math.div`), ao lado de `* / + % -`, ou em `@media` | `$nome` / `@nome`. Um token gerado vem com `@use '<caminho>/tokens' as *;` (Sass: sem `;`) ou `@import (reference) '<caminho>/_tokens.less';` |
| Número no JSX (`padding: 16`) | `'var(--nome)'`, com o tipo de aspas que o arquivo mais usa |
| String no JSX (`'8px 16px'`) | `'8px var(--nome)'` |
| Angular `[style.padding.px]="16"` / `{'gap.px': 16}` | `[style.padding]="'var(--nome)'"` / `{'gap': 'var(--nome)'}` |
| JS/TS lido por JavaScript: canvas, gráficos, funções desconhecidas (`ctx.fillStyle = '#4f46e5'`) | `color.indigo[600]` do `tokens.ts`/`tokens.js` gerado, com o `import` acrescentado (veja abaixo) |

### Canvas e gráficos: o módulo `tokens.ts`

`var()` não funciona onde o JavaScript lê o valor (um canvas, uma biblioteca de gráficos). Para esses casos, o [`generate`](generate.md#o-módulo-tokensts) grava o `tokens.ts` (ou `tokens.js`) ao lado do `tokens.css`, e o `fix` o usa:

```ts
import { color } from '../design-tokens/tokens';

ctx.fillStyle = color.indigo[600];
```

O import vai depois dos outros imports do arquivo, com o tipo de aspas dele; um import do módulo que já existe é estendido, e um nome já usado no arquivo é importado com outro nome (`color as tokenColor`). Um arquivo sem `import`/`export` (um script clássico) ou um arquivo `.cjs` é pulado como `needs-token-module`.

### Temas

Com [tokens de tema](themes.md), o valor em `.card` e o em `.dark .card` são trocados pelo mesmo token semântico, que já tem um valor por modo.

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
| `unit-in-binding` | `[style.width.px]="a ? 16 : 24"`: a unidade no nome vale para os dois valores. Também um número em `host: { '[style.width.px]': '16' }` |
| `needs-token-module` | O valor é lido por JavaScript (canvas, gráfico ou função desconhecida), onde `var()` não funciona, e o módulo `tokens.ts` não pode ser usado: ele não foi gerado, ou o arquivo não consegue importá-lo |
| `svg-attribute` | O valor está num atributo de apresentação do SVG (`fill="#fff"`). Os navegadores não concordam sobre `var()` ali, e a especificação ainda está em discussão: passe para `style` ou edite à mão |
| `ambiguous-token` | Dois tokens do projeto têm este valor e são igualmente usados: escolher um seria palpite |
| `overlap` | Duas trocas no mesmo trecho de texto |
| `breaks-syntax` | O arquivo corrigido teria um erro de sintaxe (ele é analisado de novo em memória antes de gravar) |
| `changed-on-disk` | O arquivo mudou enquanto o comando rodava |
| `symlink`, `outside-root` | O arquivo é um link simbólico ou aponta para fora do projeto |

## Valores próximos de um token: `--approximate`

```bash
npx tokentidy fix --approximate               # num terminal: pergunta por grupo
npx tokentidy fix --approximate --yes         # aplica o que passa pelas guardas
npx tokentidy fix --approximate --no-input    # só lista, não muda nada próximo
```

Com `--approximate`, o `fix` também troca valores que são *quase* um token do projeto: um pouco fora do grid de espaçamento (`15px` perto de um token de `16px`, no mesmo papel) ou uma cor dentro do `colorTolerance` dele (`#4f46e6` perto de `#4f46e5`). Os valores são agrupados por papel, do mesmo jeito que o [`generate` consolida](generate.md#valores-próximos-consolidação), e cada grupo é mostrado antes de qualquer coisa acontecer. Uma cor perto de um token do projeto sempre vai para esse token, mesmo que a cor solta seja mais usada:

```
.card padding: 15px ×1 → var(--space-m) (16px)
  a.css:3:18	padding: 15px → var(--space-m)	+1px
Apply? [y]es [n]o [a]ll in this group [q]uit
```

**Guardas de coerência.** Uma troca pode mover um valor, nunca uma relação. Antes de um grupo ser oferecido, cada elemento que ele toca é analisado por inteiro, e uma troca que quebraria algo que valia é bloqueada, com o motivo (`blocked: merges .btn:hover with .btn`):

| Guarda | Mantém |
|---|---|
| estados distintos | `:hover`, `:focus`, `:active`, classes modificadoras e os dois lados de uma condicional (`isActive ? a : b`, `[class.x]`) diferentes da base |
| contraste | o texto sobre o fundo (o próprio, o de um pai ou o da página) em 4,5:1 (3:1 para texto grande e para a borda de um controle) quando já estava |
| forma do inset | a ordem entre padding vertical e horizontal |
| ordem dos espaçamentos | espaçamento interno menor que o externo (padding vs. gap vs. margin) |
| raio aninhado | raio interno = raio externo − padding, e um raio interno nunca maior que o externo |
| escala tipográfica | títulos continuam maiores que o texto abaixo deles, e line-height/font-size muda no máximo 5% |
| variantes | `.btn-sm` e `.btn-lg` continuam diferentes |

**As respostas ficam salvas.** `y` (ou `a`) aplica o grupo inteiro, `n` o rejeita, `q` para de perguntar (os grupos restantes ficam sem resposta e sem mudança). Cada resposta vai para o `tokentidy.decisions.json` na raiz do projeto; faça commit dele, para o time não responder a mesma pergunta de novo. Um grupo rejeitado nunca é oferecido de novo, nem com `--yes`; apague a linha dele para ser perguntado outra vez. O `--dry-run` pergunta, mas não salva nada.

```json
{
  "version": 1,
  "decisions": {
    "spacing|padding|card|16px|15px": "rejected"
  }
}
```

**Fora de um terminal** (CI, hooks, pipes) nada espera uma resposta: `--approximate` sozinho é erro de uso (`2`), e você escolhe `--yes` ou `--no-input`. O mesmo vale para `--json`: a saída JSON nunca pergunta, nem num terminal. `--yes` e `--no-input` sem `--approximate` também são erros de uso.

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
| `--tokens <dir>` | Pasta com os tokens gerados (padrão: `output` da configuração, `design-tokens`). Fora do app, como um pacote compartilhado num monorepo, a raiz passa a ser a pasta que contém os dois ([micro-frontends](micro-frontends.md)) |
| `--config <file>` | Arquivo de configuração (padrão: `tokentidy.config.json` no projeto) |
| `--dry-run` | Mostra um diff unificado em vez de gravar |
| `--json` | Mostra o resultado em JSON ([Saída JSON](json-output.md)) |
| `--approximate` | Também troca valores próximos de um token, quando as guardas permitem ([acima](#valores-próximos-de-um-token---approximate)) |
| `--yes` | Com `--approximate`: aplica todo grupo que passa pelas guardas, sem perguntar (grupos rejeitados continuam rejeitados) |
| `--no-input` | Com `--approximate`: nunca pergunta; só lista os grupos |

## Código de saída

Como o `eslint --fix`: `0` quando não sobram violações nem erros de sintaxe, `1` quando sobram (também com `--dry-run`, contando como se a correção tivesse sido aplicada), `2` para erros de uso. Veja [Códigos de saída](exit-codes.md).
