# Primeiros passos

> 🇺🇸 Para ler este arquivo em inglês, [clique aqui](../quick-start.md).

Esta página leva você do zero a um projeto usando design tokens, em três passos. Ela supõe que o TokenTidy está [instalado](installation.md) e que o terminal está na pasta do seu projeto.

Não sabe bem o que é um design token? Leia [Design tokens](design-tokens.md) antes.

## 1. Encontre os valores fixos no código

```bash
npx tokentidy check
```

Cada linha é um valor visual escrito direto no código:

```
src/App.jsx:29:28	violation	color/hardcoded	color	#4f46e5
src/App.scss:8:8	violation	spacing/hardcoded	gap	10px
src/App.jsx:31:12	review	size/no-context	width	120
```

Leia assim: *arquivo:linha:coluna*, tipo de item, regra, propriedade CSS e valor. No VS Code, <kbd>Ctrl</kbd> + clique (<kbd>Cmd</kbd> + clique no macOS) na posição abre o arquivo naquele ponto. No fim aparece um resumo:

```
57 violations, 9 review in 3 files; 3 ignored by comment; 1 file skipped
```

- **violation** (violação): um valor que deveria ser um token;
- **review** (revisão): um valor que o código sozinho não consegue julgar (nunca faz o comando falhar).

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

Ele cria a pasta `design-tokens/` com `tokens.tokens.json` e `tokens.css` (e `_tokens.scss` ou `_tokens.less` se o projeto usar). Só valores usados pelo menos duas vezes viram tokens. Mais em [O comando generate](generate.md).

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
