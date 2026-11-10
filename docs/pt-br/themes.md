# Temas (claro e escuro)

> 🇺🇸 Para ler este arquivo em inglês, [clique aqui](../themes.md).

Quando o código já tem um tema escuro escrito à mão, o `generate` transforma cada par de cores (uma para o claro, uma para o escuro) em **um token semântico com um valor por modo**. Depois do `fix`, a regra clara e a escura usam o mesmo token, e a troca de tema acontece num lugar só.

## O que conta como tema escuro

Uma regra cujo seletor começa com uma marca de escuro, ou que está dentro de uma media query de escuro:

| Forma | Exemplo |
|---|---|
| Classe | `.dark`, `.dark-mode`, `.dark-theme`, `.theme-dark`, `.mode-dark` |
| Atributo | `[data-theme="dark"]`, `[data-mode="dark"]`, `[data-color-scheme="dark"]` |
| Media | `@media (prefers-color-scheme: dark)` |
| Angular | `:host-context(.dark)` |

O valor claro é o mesmo seletor sem a marca: `.dark .card` forma par com `.card`, e `.dark body` ou `.dark` sozinho com `body`/`:root`.

Um par só vira token de tema quando está claro: um valor por modo, e valores diferentes. `.darker`, seletores com outras pseudo-classes, listas de seletores, regras dentro de outras media queries e papéis com duas cores no claro ficam como estão.

## Exemplo

```css
body { background: #ffffff; color: #111827; }
.dark body { background: #111827; color: #f9fafb; }
.card { background: #ffffff; }
.dark .card { background: #1f2937; }
```

O `generate` grava:

```css
:root {
  --color-gray-900: #1f2937;
  --color-gray-950: #111827;
  --color-white: #ffffff;
  --color-bg-card: var(--color-white);
  --color-bg-default: var(--color-white);
  --color-text-default: var(--color-gray-950);
}

.dark {
  --color-bg-card: var(--color-gray-900);
  --color-bg-default: var(--color-gray-950);
  --color-text-default: var(--color-white);
}
```

O bloco escuro repete o seletor que o projeto já usa (`.dark`, `[data-theme="dark"]`) ou, para a media query, `@media (prefers-color-scheme: dark) { :root { … } }`. Os valores de que um tema precisa viram tokens mesmo usados uma vez só.

Depois, o `fix` escreve `var(--color-bg-card)` tanto em `.card` quanto em `.dark .card`.

## Arquivos

Além dos arquivos de sempre, o `generate` grava:

| Arquivo | O que tem |
|---|---|
| `tokens.light.tokens.json` | Os tokens semânticos com os valores do claro (aliases para os primitivos) |
| `tokens.dark.tokens.json` | Os mesmos tokens com os valores do escuro, e os seletores usados para o escuro |
| `tokens.resolver.json` | Um [Resolver DTCG](https://www.w3.org/community/reports/design-tokens/CG-FINAL-resolver-20251028/) (`2025.10`): os tokens base mais um modificador `theme` com `light` (padrão) e `dark` |

Ferramentas que leem o Resolver Module produzem cada tema a partir desses arquivos, e o [`validate`](validate.md) os confere. Um `tokens.resolver.json` que o TokenTidy não escreveu nunca é sobrescrito.

## Limites

- Só cores, e só um tema escuro sobre um claro padrão. Um projeto cujo padrão é escuro, com uma sobreposição `.light`, não é detectado.
- Custom properties que o projeto já redefine por tema (`--bg` em `:root` e em `.dark`) ficam como estão: já são um tema.
- `_tokens.scss`, `_tokens.less` e o módulo `tokens.ts` guardam só o valor do claro.
- Desligado junto com os aliases semânticos (`"semanticTokens": false`).
