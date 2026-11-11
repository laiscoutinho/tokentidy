# Configuração

> 🇺🇸 Para ler este arquivo em inglês, [clique aqui](../configuration.md).

O TokenTidy funciona sem nenhuma configuração. Para mudar os padrões, crie um arquivo chamado `tokentidy.config.json` na raiz do projeto (ao lado do `package.json`). Todas as chaves são opcionais.

```json
{
  "minOccurrences": 2,
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
| `minOccurrences` | `2` | Usos necessários para um valor virar token (inteiro, pelo menos 2) |
| `gridBase` | `4` | Grid de espaçamento em px: dá nome à escala e decide o que está fora do grid |
| `rootFontSize` | detectado em `html { font-size }`, ou `16` | px por `rem`, para comparar `rem` com `px` |
| `output` | `design-tokens` | Pasta dos tokens gerados, relativa ao projeto |
| `splitThreshold` | `60` | A partir de quantos tokens o CSS é dividido em um arquivo por categoria |
| `semanticTokens` | `true` | Gerar aliases semânticos (`color-text-danger`) |
| `ignore` | `[]` | Padrões de arquivos e pastas a pular, relativos à raiz do projeto (`legacy/**`). Eles são listados como pulados, com o motivo `ignored`. Um padrão começando com `!` traz arquivos de volta ([abaixo](#padrões-do-ignore)) |
| `componentProps` | `gap`, `rowGap`, `columnGap`, `padding*`, `margin*` (com `X`/`Y`), `color`, `backgroundColor`, `borderColor`, `borderRadius`, `fontSize`, `lineHeight` | Props de componente lidas como valores de estilo (`<Stack gap="12px">`), como uma lista de nomes de props. A lista substitui o padrão; `[]` desliga. Só texto com unidade ou cor é lido ([check](check.md#onde-ele-procura)) |
| `includeMinified` | `false` | Analisar arquivos minificados em vez de listá-los como pulados |
| `colorTolerance` | `0.02` | Quão perto duas cores precisam estar (ΔE em OKLab, `0` ou mais) para contar como a mesma decisão: usado pela [consolidação](generate.md#valores-próximos-consolidação) e pelo [`fix --approximate`](fix.md#valores-próximos-de-um-token---approximate) |

## Padrões do ignore

Os padrões são lidos em ordem e **vale o último que casa**, como no `.gitignore`. Um `!` na frente traz de volta o que um padrão anterior, ou a exclusão padrão de testes e stories ([check](check.md#o-que-ele-pula)), deixou de fora:

```json
{ "ignore": ["legacy/**", "!legacy/theme.css", "!src/**/*.stories.tsx"] }
```

Aqui `legacy/` é pulada, menos `legacy/theme.css`, e as stories de `src/` são analisadas.

## Qual valor vale

Uma opção na linha de comando vale mais que o arquivo de configuração, que vale mais que o padrão. Por exemplo, `--min-occurrences 3` vale mais que `"minOccurrences": 2`.

## Outro arquivo

Para usar um arquivo de configuração com outro nome ou em outro lugar:

```bash
npx tokentidy check --config configs/tokentidy.json
```

## Erros são avisados

Uma chave desconhecida, um valor do tipo errado ou um JSON inválido interrompe o comando com código de saída `2` e uma mensagem com o nome da chave. Nada é ignorado em silêncio.
