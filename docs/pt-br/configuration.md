# Configuração

> 🇺🇸 Para ler este arquivo em inglês, [clique aqui](../configuration.md).

O TokenTidy funciona sem nenhuma configuração. Para mudar os padrões, crie um arquivo chamado `tokentidy.config.json` na raiz do projeto (ao lado do `package.json`). Todas as chaves são opcionais.

```json
{
  "minOccurrences": 3,
  "gridBase": 4,
  "rootFontSize": 16,
  "output": "design-tokens",
  "splitThreshold": 60,
  "semanticTokens": true,
  "ignore": ["legacy/**", "**/*.generated.css"],
  "includeMinified": false,
  "colorTolerance": 0.02
}
```

## Chaves

| Chave | Padrão | O que faz |
|---|---|---|
| `minOccurrences` | `3` | Usos necessários para um valor virar token (inteiro, pelo menos 2) |
| `gridBase` | `4` | Grid de espaçamento em px: dá nome à escala e decide o que está fora do grid |
| `rootFontSize` | detectado em `html { font-size }`, ou `16` | px por `rem`, para comparar `rem` com `px` |
| `output` | `design-tokens` | Pasta dos tokens gerados, relativa ao projeto |
| `splitThreshold` | `60` | A partir de quantos tokens o CSS é dividido em um arquivo por categoria |
| `semanticTokens` | `true` | Gerar aliases semânticos (`color-text-danger`) |
| `ignore` | `[]` | Padrões de arquivos e pastas a pular, relativos à raiz do projeto (`legacy/**`). Eles são listados como pulados, com o motivo `ignored`. Um padrão começando com `!` traz arquivos de volta ([abaixo](#padrões-do-ignore)) |
| `componentProps` | `gap`, `rowGap`, `columnGap`, `padding*`, `margin*` (com `X`/`Y`), `color`, `backgroundColor`, `borderColor`, `borderRadius`, `fontSize`, `lineHeight` | Props de componente lidas como valores de estilo (`<Stack gap="12px">`), como uma lista de nomes de props. A lista substitui o padrão; `[]` desliga. Só texto com unidade ou cor é lido ([check](check.md#onde-ele-procura)) |
| `styleSinks` | `TextStyle` do Pixi e `add.text` do Phaser | Chamadas de bibliotecas cujos argumentos objeto são estilo, como `{ "call": "TextStyle", "keys": ["fill", "fontSize"] }` ([abaixo](#destinos-de-estilo)). A lista se soma aos padrões |
| `includeMinified` | `false` | Analisar arquivos minificados em vez de listá-los como pulados |
| `colorTolerance` | `0.02` | Quão perto duas cores precisam estar (ΔE em OKLab, `0` ou mais) para contar como a mesma decisão: usado pela [consolidação](generate.md#valores-próximos-consolidação) e pelo [`fix --approximate`](fix.md#valores-próximos-de-um-token---approximate) |

## Padrões do ignore

Os padrões são lidos em ordem e **vale o último que casa**, como no `.gitignore`. Um `!` na frente traz de volta o que um padrão anterior, ou a exclusão padrão de testes e stories ([check](check.md#o-que-ele-pula)), deixou de fora:

```json
{ "ignore": ["legacy/**", "!legacy/theme.css", "!src/**/*.stories.tsx"] }
```

Aqui `legacy/` é pulada, menos `legacy/theme.css`, e as stories de `src/` são analisadas.

## Destinos de estilo

Algumas bibliotecas recebem um objeto de estilo que não é CSS: uma biblioteca de jogo ou de canvas desenha texto com `new TextStyle({ fill: '#ffffff', fontSize: 24 })`. O TokenTidy lê duas por padrão:

| Chamada | Chaves lidas |
|---|---|
| `TextStyle` (Pixi: `new TextStyle({...})`, `new PIXI.TextStyle({...})`) | `fill`, `stroke`, `fontFamily`, `fontSize`, `fontWeight`, `letterSpacing`, `lineHeight`, `dropShadowColor` |
| `add.text` (Phaser: `this.add.text(x, y, texto, {...})`) | `color`, `backgroundColor`, `stroke`, `fontFamily`, `fontSize`, `fontStyle` |

Para ler outra biblioteca, acrescente a chamada dela. `call` é o fim do nome da função ou classe (`Text` casa com `new Text(...)` e `new PIXI.Text(...)`; `make.text` casa com `this.make.text(...)`), e `keys` limita as chaves lidas; sem `keys`, todas são lidas:

```json
{ "styleSinks": [{ "call": "Text", "keys": ["fill", "fontSize"] }] }
```

Todo argumento objeto da chamada é lido, também através de um `const`. Os valores são `js-value`: o `fix` os escreve a partir do [módulo `tokens.ts`](fix.md#canvas-e-gráficos-o-módulo-tokensts).

## Qual valor vale

Uma opção na linha de comando vale mais que o arquivo de configuração, que vale mais que o padrão. Por exemplo, `--min-occurrences 2` vale mais que `"minOccurrences": 4`.

## Outro arquivo

Para usar um arquivo de configuração com outro nome ou em outro lugar:

```bash
npx tokentidy check --config configs/tokentidy.json
```

## Erros são avisados

Uma chave desconhecida, um valor do tipo errado ou um JSON inválido interrompe o comando com código de saída `2` e uma mensagem com o nome da chave. Nada é ignorado em silêncio.
