# Primeiros passos

> 🇺🇸 Para ler este arquivo em inglês, [clique aqui](../quick-start.md).

Esta página leva você do zero a um projeto usando design tokens, em três passos. Ela supõe que o TokenTidy está [instalado](installation.md) e que o terminal está na pasta do seu projeto.

Não sabe bem o que é um design token? Leia [Design tokens](design-tokens.md) antes.

## 1. Encontre os valores fixos no código

```bash
npx tokentidy check
```

Aparece uma tabela por arquivo, com cada valor visual escrito direto no código:

```
src/Card.css
  Line   Type      Property   Value     Use instead
  2:10   color     color      #4f46e5   --color-primary
  3:8    spacing   gap        10px      —

✖ 2 hardcoded values in 1 file.
  1 of them already has a token: run tokentidy fix to replace it.
  1 item for review: tokentidy check --review
```

Cada linha tem a linha e a coluna, o tipo de valor, a propriedade CSS, o valor e, quando o projeto já tem um, o token a usar. As últimas linhas dizem o que rodar em seguida. Valores que o código sozinho não consegue julgar, como um `width`, são itens de revisão: o `check --review` mostra, e eles nunca fazem o comando falhar.

Num pipe ou no CI, os mesmos valores saem como linhas separadas por tabulação (`arquivo:linha:coluna`, tipo, regra, propriedade, valor), que o VS Code transforma em links.

Mais em [O comando check](check.md) e [Regras](rules.md).

## 2. Crie tokens a partir dos valores repetidos

Se o projeto ainda não tem tokens, deixe o TokenTidy propor. Primeiro olhe sem gravar nada:

```bash
npx tokentidy generate --dry-run
```

Depois grave os arquivos:

```bash
npx tokentidy generate
```

Ele cria a pasta `design-tokens/` com o `tokens.css`. Só valores usados pelo menos 3 vezes viram tokens. Você pode editar nomes e valores no `tokens.css`: o próximo `generate` mantém. Para outros formatos, adicione `--dtcg`, `--scss`, `--less`, `--ts` ou `--js`. Mais em [O comando generate](generate.md).

> Carregue `design-tokens/tokens.css` no seu app (por exemplo, importando no seu arquivo de estilos principal), para os tokens `var(--...)` funcionarem.

## 3. Troque os valores pelos tokens

Veja o que mudaria, em formato de diff, sem mexer em nenhum arquivo:

```bash
npx tokentidy fix --dry-run
```

Se estiver certo, aplique:

```bash
npx tokentidy fix
```

O `fix` só usa tokens com **exatamente o mesmo valor**, e só edita o trecho de cada arquivo onde o valor está. Mais em [O comando fix](fix.md).

## E depois?

Rode `npx tokentidy check` de novo: o que sobrar são os valores que precisam de uma decisão sua. Para manter o projeto limpo com o tempo, rode o `check` no CI ou antes de cada commit: veja [Scripts e CI](ci-and-scripts.md).

Todos os comandos estão em [Comandos](commands.md).
