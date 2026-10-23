# Regras

> 🇺🇸 Para ler este arquivo em inglês, [clique aqui](../rules.md).

Todo item que o [`check`](check.md) mostra tem uma **regra**: um identificador curto que diz o que foi encontrado. Os identificadores de regra também são o que os [comentários de ignore](ignore-comments.md) usam.

## Violações

A regra de uma violação é `<tipo>/hardcoded` (`color/hardcoded`, `spacing/hardcoded`…). O tipo também é a categoria de token usada pelo [`generate`](generate.md).

| Tipo | Propriedades | Valores |
|---|---|---|
| `color` | `color`, `background*`, `border*-color`, `outline*`, `fill`, `stroke`, `text-decoration*` e outras | Qualquer sintaxe de cor: `#fff`, `red`, `rgb()`, `hsl()`, `oklch()`, `color-mix()`… Uma função de cor conta como um valor |
| `spacing` | `margin*`, `padding*` (incluindo as lógicas), `gap`, `row-gap`, `column-gap` | Medidas em `px`, `rem`, `em`, `pt` |
| `size` | `width` e `height` com o **mesmo valor** na mesma regra (ícone, avatar) | Medidas |
| `container` | `width`, `max-width`, `inline-size` de um bloco centralizado na horizontal (`margin: 0 auto`) | Medidas |
| `radius` | `border-radius` e cada canto | Medidas e `%` |
| `border-width` | `border*-width`, e a largura em `border`, `outline` | Medidas |
| `font-family` | `font-family`, e a família em `font` | A lista de fontes inteira, a não ser que tenha só famílias genéricas |
| `font-size`, `font-weight`, `line-height` | As propriedades deles, e a posição deles no atalho `font` | Medidas, `bold`, números (`700`, `1.5`) |
| `letter-spacing` | `letter-spacing` | Medidas (com o sinal) |
| `shadow` | `box-shadow`, `text-shadow` | A sombra inteira (todas as camadas) como um valor |
| `opacity` | `opacity`, `fill-opacity`… | Números e `%` entre 0 e 1 |
| `duration`, `easing` | `transition*`, `animation*` | `s`/`ms` e `cubic-bezier()` |
| `z-index` | `z-index` | Inteiros a partir de 2 (ou a partir de -2 para baixo) |
| `breakpoint` | Condições de `@media` e `@container` | Medidas, em SCSS/Sass/Less (uma variável funciona ali) |

Alguns detalhes:

- **Atalhos** (*shorthands*) geram um item por parte: `margin: 4px 8px` gera dois; `border: 1px solid #ddd` gera um `border-width` e um `color`.
- **Funções** são analisadas por dentro: `calc()`, gradientes, `color-mix()` e funções de cor do Sass/Less (`darken(#4f46e5, 10%)`).
- **Prefixos de navegador** (`-webkit-box-shadow`) seguem a propriedade sem prefixo.
- **Custom properties locais** com um valor literal (`.card { --gap: 12px }`) também são violações, com o tipo vindo de onde são usadas (`var(--gap)` em `gap` → `spacing/hardcoded`).
- **Blocos de tokens** são definições, não violações: custom properties em `:root`/`html` (também `:root[data-theme=dark]`), em uma regra só com custom properties (que não seja `:host`), e sobrescritas de nomes definidos ali.

## Itens de revisão

Itens de revisão são o que o código sozinho não consegue decidir. Eles são mostrados e contados, mas nunca mudam o código de saída e nunca viram tokens.

| Regra | Quando |
|---|---|
| `size/no-context` | `width`, `height`, `min-*`, `max-*`, `inline-size`, `block-size` com uma medida que não é um container centralizado nem um elemento quadrado |
| `breakpoint/plain-css` | Uma medida em uma condição de `@media`/`@container` em CSS puro, onde `var()` não funciona |
| `custom-property/unknown-use` | Uma custom property local cujo papel não dá para descobrir pelos usos nem pelo valor |

## Avisos sobre comentários de ignore

Vão para a saída de erro e nunca mudam o código de saída. Veja [Comentários de ignore](ignore-comments.md).

| Regra | Quando |
|---|---|
| `ignore/too-broad` | Uma diretiva sem identificadores de regra (não ignora nada) |
| `ignore/unknown-rule` | Um identificador de regra que não existe |
| `ignore/unused` | Uma diretiva sem nada para ignorar na linha dela |

## O que não é informado

- Valores que já usam um token: `var(--x)` (incluindo o valor reserva em `var(--x, 12px)`), `$x` e `@x`; uma sombra com `var()` em qualquer camada.
- As próprias definições de tokens: `--color: #fff`, `$color: #fff`, `@color: #fff`.
- `0`, `auto`, `inherit`, `transparent`, `currentColor`, `normal`, porcentagens e unidades de viewport (`%`, `vw`, `vh`), e `z-index` de `-1`, `0` e `1`.
- Declarações dentro de `@font-face` (a definição da fonte) e `opacity` dentro de `@keyframes` (coreografia de animação).
- Interpolação SCSS (`#{...}`), parâmetros de `@include`, chamadas de mixin do Less e comentários.
- Ainda não: objetos de estilo fora do `style={{}}` (`const styles = { gap: 12 }`), CSS-in-JS (styled-components) e arquivos Vue/Svelte (listados como pulados).
- Fora do escopo: `filter`/`backdrop-filter`, `transform`/`translate`, deslocamentos de posição (`top`, `right`, `bottom`, `left`, `inset`), `outline-offset`, `text-underline-offset` e `stroke-width` sem unidade. Eles posicionam ou afetam um elemento; não são decisões de escala.
