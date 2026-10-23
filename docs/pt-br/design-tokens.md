# Design tokens

> 🇺🇸 Para ler este arquivo em inglês, [clique aqui](../design-tokens.md).

## A ideia

**Design tokens** são as decisões visuais de um design system guardadas como dados com nome: cores, espaçamentos, tipografia, bordas, sombras e assim por diante. Em vez de escrever o valor direto, o código usa o nome do token:

```css
/* ❌ Valores fixos no código */
.button {
  background-color: #4f46e5;
  padding: 10px 12px;
  border-radius: 10px;
}

/* ✅ Usando design tokens */
.button {
  background-color: var(--color-primary);
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-md);
}
```

Quando o design muda (uma nova cor primária, por exemplo), você edita **um lugar só**, e todas as telas acompanham.

## Por que valores fixos são um problema

Em quase todo projeto front-end, o design começa organizado e aos poucos se desvia:

- a mesma cor aparece escrita de cinco jeitos diferentes (`#4F46E5`, `#4f46e5`, `rgb(79, 70, 229)`…);
- surgem espaçamentos "quase iguais", como `10px`, `11px` e `12px`, que deveriam ser um só;
- os estilos ficam espalhados entre CSS, SCSS, estilos inline e componentes;
- mudar uma cor significa caçá-la à mão em vários arquivos.

O resultado é uma interface inconsistente e um código difícil de manter.

## Tokens primitivos e semânticos

- Um token **primitivo** dá nome a um valor: `--color-indigo-600: #4f46e5`.
- Um token **semântico** dá nome a um papel e aponta para um primitivo: `--color-primary: var(--color-indigo-600)`.

Código que usa tokens semânticos diz *por que* uma cor está ali, não só *qual* cor é.

## Onde os tokens ficam

| Formato | Exemplo |
|---|---|
| Custom properties do CSS | `--spacing-4: 16px;` usado como `var(--spacing-4)` |
| Variáveis SCSS / Sass | `$spacing-4: 16px;` |
| Variáveis Less | `@spacing-4: 16px;` |
| JSON [DTCG](https://www.designtokens.org/) (`*.tokens.json`) | O formato da comunidade do W3C, lido por ferramentas como Style Dictionary e Tokens Studio |

O TokenTidy lê todos eles como os tokens que o projeto já tem, e escreve todos quando [gera tokens](generate.md).

## Onde o TokenTidy entra

| Etapa | Comando |
|---|---|
| Encontrar valores fixos no código | [`check`](check.md) |
| Criar tokens a partir dos valores repetidos | [`generate`](generate.md) |
| Trocar valores por tokens | [`fix`](fix.md) |

Próximo: [Primeiros passos](quick-start.md).
