# O comando `generate`

> 🇺🇸 Para ler este arquivo em inglês, [clique aqui](../generate.md).

O `generate` transforma os valores fixos **repetidos** do projeto em design tokens, e grava tudo na pasta `design-tokens/` na raiz do projeto.

```bash
npx tokentidy generate                      # analisa a pasta atual e grava o tokens.css
npx tokentidy generate --dry-run            # mostra os arquivos, sem gravar nada
npx tokentidy generate --scss --dtcg        # grava também o _tokens.scss e o tokens.tokens.json
npx tokentidy generate --min-occurrences 2  # menos exigente: valores usados 2+ vezes (padrão 3)
```

## Arquivos que ele grava

O `tokens.css` é sempre gravado. Os outros formatos só são gravados quando você pede, ou quando a pasta de saída já os tem de uma execução anterior (aí eles continuam sendo atualizados):

| Arquivo | Quando |
|---|---|
| `tokens.css` | Sempre, quando há pelo menos um token. `:root { --x: ... }`. **É o arquivo que você edita** |
| `tokens.tokens.json` | Com `--dtcg`. O formato [DTCG 2025.10](https://www.designtokens.org/tr/2025.10/format/), para Style Dictionary, Tokens Studio e Figma |
| `_tokens.scss` | Com `--scss`. Variáveis Sass |
| `_tokens.less` | Com `--less`. Variáveis Less |
| `tokens.ts` / `tokens.js` | Com `--ts` / `--js`. Para valores lidos pelo JavaScript (canvas, gráficos): veja [O módulo `tokens.ts`](#o-módulo-tokensts) |
| `css/<categoria>.css` + `README.md` | Quando há mais de `splitThreshold` tokens (padrão 60): o `tokens.css` vira um índice com `@import` |
| `tokens.light.tokens.json`, `tokens.dark.tokens.json`, `tokens.resolver.json` | Com `--dtcg`, quando o código tem um tema escuro (os valores escuros estão sempre no `tokens.css`): veja [Temas](themes.md) |

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

## Editando os tokens

O `tokens.css` é a fonte. Renomeie um token, mude o valor ou acrescente um token seu ali, e o próximo `generate --extend` e o `fix` passam a usar. Todos os outros arquivos (`.scss`, `.less`, `.ts`, `.tokens.json`) são regravados a partir do `tokens.css`, então o que você mudar neles se perde.

O TokenTidy só lê um `tokens.css` que ele gravou (ele reconhece o comentário da primeira linha). Se o CSS tiver erro de sintaxe, o `tokens.tokens.json` anterior é usado, quando existe.

## O que ele mostra

No terminal, uma linha diz quantos tokens há e onde:

```
✔ 6 tokens saved in design-tokens/ (tokens.css).
  Next: run tokentidy fix to use them in your code.
```

Numa execução seguinte, ela diz também quantos são novos: `✔ 8 tokens (2 new) saved in …`. A contagem inclui os tokens que você acrescentou à mão no `tokens.css`. Quando nenhum valor se repete o bastante, nada é gravado:

```
No value is used 3 or more times without a token, so no token was created.
```

Os detalhes (valores abaixo do mínimo, aliases semânticos, valores consolidados, diagnóstico por tipo e sugestões) ficam no [`--json`](json-output.md). Fora de um terminal (pipe, CI), os arquivos gravados também aparecem na saída padrão, um por linha.

Com `--dry-run`, cada arquivo aparece como `==> arquivo <==` seguido do conteúdo (como o comando `head`), e nada é gravado.

## Como ele decide

- **Limite:** um valor só vira token quando aparece pelo menos `minOccurrences` vezes (padrão 3) no mesmo tipo de token. Um valor usado só uma ou duas vezes costuma ser uma escolha local, não uma decisão do projeto. Para mudar, use `--min-occurrences <n>` ou `minOccurrences` na [configuração](configuration.md) (mínimo 2).
- **Agrupamento:** grafias diferentes do mesmo valor viram um token só (`#FFF`, `white` e `rgb(255 255 255)`; `12pt` e `16px`; `.2s` e `200ms`; `bold` e `700`). Valores só *próximos* são juntados apenas pela [consolidação](#valores-próximos-consolidação), que tem regras rígidas.
- **Papéis:** o mesmo valor usado como `spacing`, `font-size` e `line-height` vira três tokens.
- **Nomes:** espaçamentos e tamanhos no grid (`spacing-2` = 8px com grid de 4px; `spacing-2_5` = 10px); escalas conhecidas quando o valor bate (`radius-lg`, `font-size-base`, `shadow-md`); cores pela cor mais próxima da paleta do Tailwind v4 e pela luminosidade (`color-indigo-600`, `color-gray-950` para `#111827`, `color-black-a50` para preto com 50% de opacidade); senão, o próprio número (`font-size-13`).
- **Famílias e degraus de cor:** a família vem do matiz (um quase cinza com um leve tom continua `gray`), e o degrau, da luminosidade OKLCH na curva dessa família. O número sempre cresce do mais claro para o mais escuro, como 50 → 950: uma cor fica com o degrau padrão mais próximo quando ele está livre e nenhuma outra cor está entre os dois; senão, com a própria posição (`gray-303` é mais escuro que `gray-300`). Assim os nomes de uma família nunca contradizem a luminosidade.
- **O mesmo tamanho em duas unidades** (`48px` e `3rem`) gera dois tokens. O de `px` fica com o nome simples e o de `rem` leva a unidade no nome (`spacing-12` e `spacing-12-rem`): o `rem` acompanha o tamanho de fonte da pessoa e o `px` não, então não são a mesma decisão.
- **Ficam de fora:** valores de testes, stories e fixtures (eles [não são analisados](check.md#o-que-ele-pula)) e [itens de revisão](rules.md#itens-de-revisão) como truques de CSS (`value/hack`: `1ms`, `0.1px`, `9999em`). Valores cujo único token é recusado pelo `fix` por causa do nome continuam contando como sem token.
- **Ordem:** por categoria e, dentro dela, do menor para o maior. O mesmo projeto sempre gera os mesmos arquivos.

## Valores próximos: consolidação

Um valor que é *quase* outro (`15px` perto de `16px`, `#4f46e6` perto de `#4f46e5`) costuma ser uma inconsistência, não uma decisão. O `generate` o junta ao valor que ele deveria ser, para o conjunto de tokens seguir as decisões reais do projeto:

- **Espaçamento, tamanhos e raio:** um valor fora do grid `gridBase` se junta ao valor no grid usado no **mesmo papel**: mesmo tipo, mesma família de propriedade (`padding`) e mesmo componente (`.card`, `.card-footer`; `.tile` e `.panel` também contam como card). Ele vai para o **passo do grid mais próximo**, nunca a mais de meio grid (`15px` → `16px`, nunca `12px`). Num empate (`14px` entre 12 e 16), vai para o passo que o projeto mais usa naquele tipo, depois para o grid mais grosso. O alvo só depende do valor e do tipo, então o mesmo valor vai para o mesmo passo em todos os papéis. `15px`, `16px` e `17px` em cards viram um token de `16px`.
- **Dois valores no grid nunca são juntados** (`12px` e `16px` são duas decisões). Valores menores que o grid (`1px`, `2px`) e raios de pílula (`9999px`) ficam como estão. Valores em `rem` continuam em `rem`.
- **Cores:** uma cor se junta à cor mais usada dentro do `colorTolerance` (ΔE em OKLab, padrão `0.02`) com a mesma opacidade. Ela se junta à mais usada, nunca a uma vizinha, então não se formam cadeias `a ≈ b ≈ c`. Só dentro do **mesmo tom**: no máximo 15° de diferença, e uma neutra (cinza, branco, preto) nunca se junta a uma cor com tom, por menor que seja o ΔE.
- **Tamanhos de fonte:** quando a maioria está em `rem`, um tamanho em `px` de mesmo tamanho se junta ao em `rem`.
- **Guardas:** uma junção que quebraria uma relação (uma cor de `:hover` igual à base, um texto perdendo contraste, `.btn-sm` igual a `.btn-lg`) é bloqueada, com o motivo. São as mesmas [guardas de coerência](fix.md#valores-próximos-de-um-token---approximate) do `fix --approximate`. Um grupo rejeitado no `tokentidy.decisions.json` também não é juntado.

Cada junção é listada em `consolidated` no [`--json`](json-output.md), com os valores juntados e as junções bloqueadas por uma guarda.

O `generate` só cria os tokens: o código continua com `15px` até você rodar o [`fix --approximate`](fix.md#valores-próximos-de-um-token---approximate), que pergunta antes de mudar.

## O módulo `tokens.ts`

`var()` não funciona onde o JavaScript lê um valor: `ctx.fillStyle`, opções de gráfico, uma cor passada para uma função. Para eles, o `generate --ts` grava o `tokens.ts` (`--js` grava o `tokens.js`), com os mesmos tokens como objetos:

```ts
export const color = {
  indigo: {
    600: '#4f46e5',
  },
} as const;
```

Os aliases já vêm resolvidos, já que ali não existe `var()`. O [`fix`](fix.md#canvas-e-gráficos-o-módulo-tokensts) o usa para escrever `color.indigo[600]` e acrescenta o `import`. Depois de gerado, o módulo é mantido atualizado por todo `generate`.

## Tokens que o projeto já tem

**Tokens escritos à mão** (`--x` no `:root`, `$x`, `@x`, `*.tokens.json`) são sempre reaproveitados: são decisões suas. Um token que o código ainda não usa ganha o tipo pelo nome ou pelo `$type`, como no [`fix`](fix.md#tokens-escritos-à-mão): com `--space-4: 16px`, um `padding: 16px` o reaproveita, e nenhum `--spacing-4` é criado.

- Se já existe um token para um valor e ele funciona em todo lugar onde o valor é usado (uma custom property do CSS), ele é reaproveitado, não é criado de novo, e o resumo diz isso (`2 values already have a token, so no new one was made for them.`). O `--json` lista esses valores em `reused`.
- Se o token existente não funciona em algum lugar (uma variável `$scss`, mas o valor também aparece em JSX ou em um template Angular), um token CSS é criado mesmo com um uso só, e a variável SCSS fica registrada como equivalente.
- Um valor já definido em um arquivo DTCG escrito à mão mantém o caminho dele como nome (`color.primary` → `--color-primary`).

**Quais tokens contam como existentes:** uma custom property só conta se for global (`:root`, `html`, `body`, mesmo numa lista como `:root, [data-theme=light]`) e nenhum tema der outro valor a ela. `$x`/`@x` só contam em nível de arquivo. É a mesma regra do [`fix`](fix.md#qual-token-é-usado), então um valor nunca fica sem token novo e sem troca.

## Rodando de novo

Se a pasta de saída já tem tokens gerados antes, o `generate` precisa de uma decisão:

| Flag | O que faz |
|---|---|
| `--extend` | Mantém os nomes que o TokenTidy gerou antes e acrescenta os novos |
| `--new` | Esquece a saída anterior do TokenTidy e dá nome a tudo de novo (tokens escritos à mão continuam sendo reaproveitados). Nomes e tokens que você mudou ou acrescentou no `tokens.css` também se perdem. Recusa se o arquivo DTCG tiver tokens escritos à mão |
| nenhuma, em um terminal | Pergunta: `Keep their names and add the new ones (e), or start over (n)? [e/n]` |
| nenhuma, fora de um terminal (CI, hook, pipe) ou com `--json` | Para com código de saída `2`: `Use --extend to keep their names and add the new ones, or --new to start over.` |
| `--dry-run` sem flag | Mostra o que o `--extend` geraria |

## Diagnóstico, sugestões e aliases semânticos

Os três ficam no [`--json`](json-output.md) (`diagnosis`, `suggestions`, `aliases`), não na saída do terminal.

- **Diagnóstico:** por tipo, quantos valores diferentes, quantos têm token, e que parte dos usos já cai em um token. Espaçamento é comparado com o IBM Carbon (13 passos) e tamanhos de fonte com o Material 3 (15 estilos), só como referência: acima dela, ele avisa e conta os valores usados uma vez, os primeiros candidatos a juntar.
- **Sugestões:** espaçamentos e tamanhos fora do grid, e o mesmo tamanho escrito em `px` e em `rem`. Nada é alterado por elas; você decide.
- **Aliases semânticos:** quando o papel de uma cor é claro (propriedade + palavras no seletor + estado), é acrescentado um alias que aponta para o primitivo: `--color-text-danger: var(--color-red-500)`. Desligue com `"semanticTokens": false` na [configuração](configuration.md). Com um tema escuro no código, esses aliases ganham um valor por modo ([Temas](themes.md)).

## O que o arquivo DTCG guarda

Com `--dtcg`, cada token no `tokens.tokens.json` guarda, em `$extensions["dev.tokentidy"]`, o valor normalizado, quantas vezes é usado, todas as grafias encontradas e os equivalentes. Um alias semântico também guarda **onde** é usado (arquivo, propriedade e seletor), que o `fix` precisa para colocá-lo só onde o papel combina. Linha e coluna ficam de fora de propósito: mudam a cada edição, e o arquivo é feito para ir para o git. Para ver cada uso de um valor, rode `generate --json`.

## Gravação segura

- A pasta de saída precisa ficar dentro do projeto (também através de links simbólicos); senão, código de saída `2`.
- Cada arquivo é gravado de forma atômica (um arquivo temporário, depois uma renomeação), então uma execução interrompida nunca deixa meio arquivo.
- O TokenTidy só sobrescreve ou apaga arquivos que ele gerou (ele reconhece o cabeçalho). Arquivos gerados que não são mais necessários (como `css/*.css` quando a divisão deixa de existir) são removidos; um arquivo seu com o mesmo nome interrompe a execução com um erro.
- Um `tokens.tokens.json` corrompido (quando o `tokens.css` não pode ser lido) interrompe a execução com o caminho dele e `Fix it or use --out`.

## Opções

| Opção | O que faz |
|---|---|
| `--min-occurrences <n>` | Usos necessários para um valor virar token (padrão 3, mínimo 2) |
| `--out <dir>` | Pasta de saída (padrão: `design-tokens` dentro do projeto) |
| `--config <file>` | Arquivo de configuração (padrão: `tokentidy.config.json` no projeto) |
| `--extend` / `--new` | Veja [Rodando de novo](#rodando-de-novo) |
| `--dtcg` | Grava também o `tokens.tokens.json` (e os arquivos de tema) |
| `--scss` / `--less` | Grava também o `_tokens.scss` / `_tokens.less` |
| `--ts` / `--js` | Grava também o `tokens.ts` / `tokens.js` |
| `--dry-run` | Mostra os arquivos em vez de gravá-los |
| `--shared <dir>` | Micro-frontends: valores usados por dois ou mais apps vão para esta pasta, o resto para a pasta de cada app ([Micro-frontends](micro-frontends.md#um-pacote-de-tokens-compartilhado-generate---shared)) |
| `--json` | Mostra o resultado em JSON ([Saída JSON](json-output.md)) |

## Código de saída

`0` quando os tokens foram gerados; `1` se um arquivo tem erro de sintaxe (o conjunto de tokens pode estar incompleto); `2` para erro de uso ou de configuração, pasta de saída fora do projeto ou arquivo de tokens corrompido. Veja [Códigos de saída](exit-codes.md).
