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
  "includeMinified": false
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
| `ignore` | `[]` | Padrões de arquivos e pastas a pular, relativos à raiz do projeto (`legacy/**`). Eles são listados como pulados, com o motivo `ignored` |
| `includeMinified` | `false` | Analisar arquivos minificados em vez de listá-los como pulados |

## Qual valor vale

Uma opção na linha de comando vale mais que o arquivo de configuração, que vale mais que o padrão. Por exemplo, `--min-occurrences 3` vale mais que `"minOccurrences": 2`.

## Outro arquivo

Para usar um arquivo de configuração com outro nome ou em outro lugar:

```bash
npx tokentidy check --config configs/tokentidy.json
```

## Erros são avisados

Uma chave desconhecida, um valor do tipo errado ou um JSON inválido interrompe o comando com código de saída `2` e uma mensagem com o nome da chave. Nada é ignorado em silêncio.
