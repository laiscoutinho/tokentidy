# O comando `generate`

> 🇺🇸 Para ler este arquivo em inglês, [clique aqui](../generate.md).

O `generate` transforma os valores fixos **repetidos** do projeto em design tokens, e grava tudo na pasta `design-tokens/` na raiz do projeto.

```bash
npx tokentidy generate                      # analisa a pasta atual e grava os tokens
npx tokentidy generate --dry-run            # mostra os arquivos, sem gravar nada
npx tokentidy generate --min-occurrences 3  # mais exigente: só valores usados 3+ vezes
```

## Arquivos que ele grava

| Arquivo | Quando |
|---|---|
| `tokens.tokens.json` | Quando há pelo menos um token. A fonte da verdade, no formato [DTCG 2025.10](https://www.designtokens.org/tr/2025.10/format/) |
| `tokens.css` | Quando há pelo menos um token. `:root { --x: ... }`, gerado a partir do JSON |
| `_tokens.scss` | Quando o projeto tem arquivos `.scss` ou `.sass` |
| `_tokens.less` | Quando o projeto tem arquivos `.less` |
| `css/<categoria>.css` + `README.md` | Quando há mais de `splitThreshold` tokens (padrão 60): o `tokens.css` vira um índice com `@import` |
| `tokens.ts` / `tokens.js` | Quando o JavaScript lê um valor (canvas, gráficos): veja [O módulo `tokens.ts`](#o-módulo-tokensts) |
| `tokens.light.tokens.json`, `tokens.dark.tokens.json`, `tokens.resolver.json` | Quando o código tem um tema escuro: veja [Temas](themes.md) |

Exemplo de `tokens.css`:

```css
:root {
  /* color */
  --color-gray-400: #9ca3af;
  --color-indigo-600: #4f46e5;
  --color-white: #ffffff;

  /* spacing */
  --spacing-2: 8px;
  --spacing-2_5: 10px;
  --spacing-3: 12px;

  /* radius */
  --radius-lg: 8px;
}
```

O seu app precisa carregar o `tokens.css` (ou o arquivo SCSS/Less) para os tokens funcionarem.

## O que ele mostra

A saída padrão lista os arquivos gravados; o resumo vai para a saída de erro:

```
design-tokens/tokens.tokens.json
design-tokens/tokens.css
design-tokens/_tokens.scss
7 new tokens, 0 kept, 0 semantic aliases
16 values used fewer than 2 times were not turned into tokens
diagnosis	color	9 values, 5 tokens, 82% of uses on a token
diagnosis	spacing	18 values, 6 tokens, 71% of uses on a token; above Carbon's 13 spacing steps, 9 values used once
suggestion	spacing	10px is off the 4px grid (nearest: 8px or 12px)
```

Com `--dry-run`, cada arquivo aparece como `==> arquivo <==` seguido do conteúdo (como o comando `head`), e nada é gravado.

## Como ele decide

- **Limite:** um valor só vira token quando aparece pelo menos `minOccurrences` vezes (padrão 2) no mesmo tipo de token. Um valor usado uma vez não é uma decisão de design repetida.
- **Agrupamento:** grafias diferentes do mesmo valor viram um token só (`#FFF`, `white` e `rgb(255 255 255)`; `12pt` e `16px`; `.2s` e `200ms`; `bold` e `700`). Valores só *próximos* são juntados apenas pela [consolidação](#valores-próximos-consolidação), que tem regras rígidas.
- **Papéis:** o mesmo valor usado como `spacing`, `font-size` e `line-height` vira três tokens.
- **Nomes:** espaçamentos e tamanhos no grid (`spacing-2` = 8px com grid de 4px; `spacing-2_5` = 10px); escalas conhecidas quando o valor bate (`radius-lg`, `font-size-base`, `shadow-md`, `container-md`); cores pela cor mais próxima da paleta do Tailwind v4 e pela luminosidade (`color-indigo-600`, `color-gray-950` para `#111827`, `color-black-a50` para preto com 50% de opacidade); senão, o próprio número (`font-size-13`).
- **Ordem:** por categoria e, dentro dela, do menor para o maior. O mesmo projeto sempre gera os mesmos arquivos.

## Valores próximos: consolidação

Um valor que é *quase* outro (`15px` perto de `16px`, `#4f46e6` perto de `#4f46e5`) costuma ser uma inconsistência, não uma decisão. O `generate` o junta ao valor que ele deveria ser, para o conjunto de tokens seguir as decisões reais do projeto:

- **Espaçamento, tamanhos e raio:** um valor fora do grid `gridBase` se junta ao valor no grid usado no **mesmo papel**: mesmo tipo, mesma família de propriedade (`padding`) e mesmo componente (`.card`, `.card-footer`; `.tile` e `.panel` também contam como card). Entre os valores no grid a no máximo um passo do grid, vence o mais próximo, depois o mais usado, depois o que está no grid mais grosso. Sem nenhum, ele vai para o passo do grid mais próximo. `15px`, `16px` e `17px` em cards viram um token de `16px`.
- **Dois valores no grid nunca são juntados** (`12px` e `16px` são duas decisões). Valores menores que o grid (`1px`, `2px`) e raios de pílula (`9999px`) ficam como estão. Valores em `rem` continuam em `rem`.
- **Cores:** uma cor se junta à cor mais usada dentro do `colorTolerance` (ΔE em OKLab, padrão `0.02`) com a mesma opacidade. Ela se junta à mais usada, nunca a uma vizinha, então não se formam cadeias `a ≈ b ≈ c`.
- **Tamanhos de fonte:** quando a maioria está em `rem`, um tamanho em `px` de mesmo tamanho se junta ao em `rem`.
- **Guardas:** uma junção que quebraria uma relação (uma cor de `:hover` igual à base, um texto perdendo contraste, `.btn-sm` igual a `.btn-lg`) é bloqueada, com o motivo. São as mesmas [guardas de coerência](fix.md#valores-próximos-de-um-token---approximate) do `fix --approximate`. Um grupo rejeitado no `tokentidy.decisions.json` também não é juntado.

Cada junção é listada na saída de erro:

```
consolidated	spacing	.card padding: 15px ×1, 17px ×1 → 16px
```

O `generate` só cria os tokens: o código continua com `15px` até você rodar o [`fix --approximate`](fix.md#valores-próximos-de-um-token---approximate), que pergunta antes de mudar.

## O módulo `tokens.ts`

`var()` não funciona onde o JavaScript lê um valor: `ctx.fillStyle`, opções de gráfico, uma cor passada para uma função. Quando o projeto tem valores assim, o `generate` também grava o `tokens.ts` (num projeto TypeScript; `tokens.js` para arquivos JavaScript), com os mesmos tokens como objetos:

```ts
export const color = {
  indigo: {
    600: '#4f46e5',
  },
} as const;
```

Os aliases já vêm resolvidos, já que ali não existe `var()`. O [`fix`](fix.md#canvas-e-gráficos-o-módulo-tokensts) o usa para escrever `color.indigo[600]` e acrescenta o `import`. Depois de gerado, o módulo é mantido atualizado por todo `generate`.

## Tokens que o projeto já tem

**Tokens escritos à mão** (`--x` no `:root`, `$x`, `@x`, `*.tokens.json`) são sempre reaproveitados: são decisões suas.

- Se já existe um token para um valor e ele funciona em todo lugar onde o valor é usado (uma custom property do CSS), ele é reaproveitado e listado (`N values already have a token in the project`).
- Se o token existente não funciona em algum lugar (uma variável `$scss`, mas o valor também aparece em JSX ou em um template Angular), um token CSS é criado mesmo com um uso só, e a variável SCSS fica registrada como equivalente.
- Um valor já definido em um arquivo DTCG escrito à mão mantém o caminho dele como nome (`color.primary` → `--color-primary`).

**Quais tokens contam como existentes:** uma custom property só conta se for global (`:root`, `html`, `body`, mesmo numa lista como `:root, [data-theme=light]`) e nenhum tema der outro valor a ela. `$x`/`@x` só contam em nível de arquivo. É a mesma regra do [`fix`](fix.md#qual-token-é-usado), então um valor nunca fica sem token novo e sem troca.

## Rodando de novo

Se a pasta de saída já tem um `tokens.tokens.json`, o `generate` precisa de uma decisão:

| Flag | O que faz |
|---|---|
| `--extend` | Mantém os nomes que o TokenTidy gerou antes e acrescenta os novos |
| `--new` | Esquece a saída anterior do TokenTidy e dá nome a tudo de novo (tokens escritos à mão continuam sendo reaproveitados). Recusa se o arquivo DTCG tiver tokens escritos à mão |
| nenhuma, em um terminal | Pergunta: `Extend them (e) or start over (n)? [e/n]` |
| nenhuma, fora de um terminal (CI, hook, pipe) ou com `--json` | Para com código de saída `2`: `Use --extend to reuse them or --new to start over.` |
| `--dry-run` sem flag | Mostra o que o `--extend` geraria |

## Diagnóstico, sugestões e aliases semânticos

- **Diagnóstico** (linhas `diagnosis`): por tipo, quantos valores diferentes, quantos têm token, e que parte dos usos já cai em um token. Espaçamento é comparado com o IBM Carbon (13 passos) e tamanhos de fonte com o Material 3 (15 estilos), só como referência: acima dela, a linha avisa e conta os valores usados uma vez, os primeiros candidatos a juntar.
- **Sugestões** (linhas `suggestion`, só mostradas): espaçamentos e tamanhos fora do grid, e o mesmo tamanho escrito em `px` e em `rem`. Nada é alterado por elas; você decide.
- **Aliases semânticos:** quando o papel de uma cor é claro (propriedade + palavras no seletor + estado), é acrescentado um alias que aponta para o primitivo: `--color-text-danger: var(--color-red-500)`. Desligue com `"semanticTokens": false` na [configuração](configuration.md). Com um tema escuro no código, esses aliases ganham um valor por modo ([Temas](themes.md)).

## O que o JSON guarda

Cada token no `tokens.tokens.json` guarda, em `$extensions["dev.tokentidy"]`, o valor normalizado, quantas vezes é usado, todas as grafias encontradas, os equivalentes e cada **ocorrência** (arquivo, linha, coluna, propriedade, seletor…). O [`fix`](fix.md) analisa o código de novo para encontrar os valores; das ocorrências, ele só lê as dos aliases semânticos, para saber onde cada alias vale.

## Gravação segura

- A pasta de saída precisa ficar dentro do projeto (também através de links simbólicos); senão, código de saída `2`.
- Cada arquivo é gravado de forma atômica (um arquivo temporário, depois uma renomeação), então uma execução interrompida nunca deixa meio arquivo.
- O TokenTidy só sobrescreve ou apaga arquivos que ele gerou (ele reconhece o cabeçalho). Arquivos gerados que não são mais necessários (como `css/*.css` quando a divisão deixa de existir) são removidos; um arquivo seu com o mesmo nome interrompe a execução com um erro.
- Um `tokens.tokens.json` corrompido interrompe a execução com o caminho dele e `Fix it or use --out`.

## Opções

| Opção | O que faz |
|---|---|
| `--min-occurrences <n>` | Usos necessários para um valor virar token (mínimo 2) |
| `--out <dir>` | Pasta de saída (padrão: `design-tokens` dentro do projeto) |
| `--config <file>` | Arquivo de configuração (padrão: `tokentidy.config.json` no projeto) |
| `--extend` / `--new` | Veja [Rodando de novo](#rodando-de-novo) |
| `--dry-run` | Mostra os arquivos em vez de gravá-los |
| `--shared <dir>` | Micro-frontends: valores usados por dois ou mais apps vão para esta pasta, o resto para a pasta de cada app ([Micro-frontends](micro-frontends.md#um-pacote-de-tokens-compartilhado-generate---shared)) |
| `--json` | Mostra o resultado em JSON ([Saída JSON](json-output.md)) |

## Código de saída

`0` quando os tokens foram gerados; `1` se um arquivo tem erro de sintaxe (o conjunto de tokens pode estar incompleto); `2` para erro de uso ou de configuração, pasta de saída fora do projeto ou arquivo de tokens corrompido. Veja [Códigos de saída](exit-codes.md).
