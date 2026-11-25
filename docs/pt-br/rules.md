# Regras

> 🇺🇸 Para ler este arquivo em inglês, [clique aqui](../rules.md).

Todo item que o [`check`](check.md) mostra tem uma **regra**: um identificador curto que diz o que foi encontrado. Os identificadores de regra também são o que os [comentários de ignore](ignore-comments.md) usam.

## Violações

A regra de uma violação é `<tipo>/hardcoded` (`color/hardcoded`, `spacing/hardcoded`…). O tipo também é a categoria de token usada pelo [`generate`](generate.md).

| Tipo | Propriedades | Valores |
|---|---|---|
| `color` | `color`, `background*`, `border*-color`, `outline*`, `fill`, `stroke`, `text-decoration*` e outras | Qualquer sintaxe de cor: `#fff`, `red`, `rgb()`, `hsl()`, `oklch()`, `color-mix()`… Uma função de cor conta como um valor. `#fff` e `#ffffff` são o mesmo valor |
| `spacing` | `margin*`, `padding*` (incluindo as lógicas), `gap`, `row-gap`, `column-gap`, `scroll-margin*`, `scroll-padding*`, `border-spacing` | Medidas em `px`, `rem`, `em`, `pt` |
| `radius` | `border-radius` e cada canto | Medidas (`50%`, o círculo, é forma, não token) |
| `border-width` | `border*-width`, e a largura em `border`, `outline` | Medidas |
| `font-family` | `font-family`, e a família em `font` | A lista de fontes inteira, a não ser que tenha só famílias genéricas |
| `font-size`, `font-weight`, `line-height` | As propriedades deles, e a posição deles no atalho `font` | Medidas, números (`700`, `1.5`), `bold`, `bolder` e `lighter` |
| `letter-spacing` | `letter-spacing` | Medidas (com o sinal) |
| `shadow` | `box-shadow`, `text-shadow`, e cada `drop-shadow()` em `filter` | A sombra inteira (todas as camadas, com a cor) como um valor |
| `duration`, `easing` | `transition*`, `animation*` | `s`/`ms` e `cubic-bezier()` |

Alguns detalhes:

- **Atalhos** (*shorthands*) geram um item por parte: `margin: 4px 8px` gera dois; `border: 1px solid #ddd` gera um `border-width` e um `color`.
- **Funções** são analisadas por dentro: gradientes, `color-mix()` e funções de cor do Sass/Less (`darken(#4f46e5, 10%)`). `calc()`, `clamp()`, `min()` e `max()` são conta de layout e não são.
- **Prefixos de navegador** (`-webkit-box-shadow`) seguem a propriedade sem prefixo.
- **Uma linha por declaração:** `box-shadow: 0 1px 2px #0003` é um valor, e cada parte de `margin: 4px 8px` aponta para a mesma declaração (`declaration` no [`--json`](json-output.md)).
- **Blocos de tokens** são definições, não violações: custom properties em `:root`/`html` (também `:root[data-theme=dark]`), em uma regra só com custom properties (que não seja `:host`), e sobrescritas de nomes definidos ali.

## Itens de revisão

Itens de revisão são o que o código sozinho não consegue decidir. Eles são contados, mas nunca mudam o código de saída e nunca viram tokens. A tabela mostra esses itens com o [`check --review`](check.md#lendo-o-resultado); o `--json` sempre lista.

| Regra | Quando |
|---|---|
| `size/no-context` | `width`, `height`, `min-*`, `max-*`, `inline-size`, `block-size` com uma medida. Um tamanho pode ser container, ícone ou só layout, e o código não diz qual |
| `value/hack` | Um truque de CSS que parece valor de design: duração quase zero (até 10ms, o truque do reduced-motion), medida abaixo de 1px (`0.1px` contra o colapso de margem), medida extrema (9999, para tirar da tela), `width`/`height` de 1px em `::before`/`::after` (uma linha fina) e a caixa de 1px do padrão visually-hidden (`position: absolute` + `overflow: hidden` + `clip`/`clip-path: inset(50%)`). A mensagem diz qual é. Um token daria nome ao truque, e um token próximo o quebraria. O raio de pílula (`9999px` em `border-radius`) é valor de design e continua violação |
| `token/theme-only` | Um valor igual a um token em um tema só (`#ffffff` enquanto o `:root` tem `--bg: #ffffff` e o `.dark` define outro valor). O valor também é uma violação; o `fix` nunca troca, porque o token seguiria o tema ([check](check.md#qual-token-serve)) |

## Sugestões

| Regra | Quando |
|---|---|
| `token/prefer-alias` | Um token primitivo é usado onde existe um alias semântico para aquele papel (`var(--color-red-500)` em `.error`, com `--color-text-danger`). Nunca falha ([check](check.md#qual-token-serve)) |

## Micro-frontends

Com dois ou mais apps ([Micro-frontends](micro-frontends.md)):

| Regra | Severidade | Quando |
|---|---|---|
| `mfe/root-collision` | violation | Dois apps definem a mesma custom property global com valores diferentes |
| `mfe/drift` | review | O mesmo papel tem um valor mais usado diferente em cada app |
| `mfe/version-mismatch` | review | Os apps dependem de versões diferentes do mesmo pacote de design system |

## Arquivos de tokens

O [`validate`](validate.md#o-que-ele-confere) tem regras próprias (`schema/invalid`, `reference/broken`, `reference/cycle`…).

## Avisos sobre comentários de ignore

Vão para a saída de erro e nunca mudam o código de saída. Veja [Comentários de ignore](ignore-comments.md).

| Regra | Quando |
|---|---|
| `ignore/too-broad` | Uma diretiva sem identificadores de regra (não ignora nada) |
| `ignore/unknown-rule` | Um identificador de regra que não existe |
| `ignore/unused` | Uma diretiva sem nada para ignorar na linha dela |

## O que não é informado

- Valores que já usam um token: `var(--x)`, `$x` e `@x`, com um [aviso](check.md#avisos-sobre-tokens) se o valor reserva em `var(--x, 12px)` discordar do token; uma sombra com `var()` em qualquer camada.
- As próprias definições de tokens: `--color: #fff`, `$color: #fff`, `@color: #fff`. Uma custom property com literal dentro de um componente (`.card { --gap: 12px }`) é um valor com nome daquele componente: não é informada, e não é oferecida como token a outros arquivos.
- `0`, `auto`, `inherit`, `transparent`, `currentColor`, `normal`, porcentagens e unidades de viewport (`%`, `vw`, `vh`).
- Declarações dentro de `@font-face` (a definição da fonte).
- Interpolação SCSS (`#{...}`), argumentos de `@include` e padrões de `@mixin` (o que a mixin faz com o valor não se sabe), chamadas de mixin do Less e comentários. Os mapas `mat.*-overrides` do Angular Material **são** lidos.
- Números e valores que não são cor em objetos passados a funções que o TokenTidy não conhece: `resize({ width: 300 })` não é estilo. Bibliotecas podem ser adicionadas com [`styleSinks`](configuration.md#destinos-de-estilo).
- Desenho dentro de um SVG: atributos `fill`/`stroke`, e o `style` de `<path>`, `<circle>`, `<g>`, gradientes e outros elementos de desenho. A raiz `<svg>` é lida. Numa folha de estilo, `fill` e `stroke` **são** informados.
- Props repassadas entre componentes (uma prop de estilo como `<Stack gap="12px">` **é** lida, veja [check](check.md#onde-ele-procura)) e objetos reexportados (`export { a } from './b'`). Num template string com `${...}`, só os trechos fixos são lidos (`` `1px solid ${cor}` `` dá `1px`).
- Arquivos de testes, stories e fixtures (veja [check](check.md#o-que-ele-pula)).
- Ainda não: arquivos Vue/Svelte (listados como pulados).
- Fora do escopo: `z-index`, `opacity`, breakpoints de `@media`/`@container`, `filter` que não seja `drop-shadow()`, `backdrop-filter`, `transform`/`translate`, deslocamentos de posição (`top`, `right`, `bottom`, `left`, `inset`), `outline-offset`, `text-underline-offset` e `stroke-width`. Eles posicionam ou afetam um elemento; não são decisões de escala.
