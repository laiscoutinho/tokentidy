# O comando `validate`

> 🇺🇸 Para ler este arquivo em inglês, [clique aqui](../validate.md).

O `validate` confere arquivos de design tokens no formato [DTCG 2025.10](https://www.designtokens.org/tr/2025.10/format/) antes que outra ferramenta os leia. Ele não altera nada.

```bash
npx tokentidy validate                                   # todos os arquivos de tokens do projeto
npx tokentidy validate design-tokens/tokens.tokens.json  # um arquivo
npx tokentidy validate --json
```

## Quais arquivos

Dentro das pastas indicadas (padrão: a pasta atual), todo `*.tokens.json` e `*.resolver.json`, menos o que o `ignore` da configuração pula. Um arquivo indicado pelo nome é conferido qualquer que seja o nome. Os arquivos que um resolver cita (`"$ref": "tokens.tokens.json"`) também são conferidos.

## O que ele confere

| Regra | Problema |
|---|---|
| `json/invalid` | O arquivo não é um JSON válido |
| `json/too-deep` | Mais de 64 níveis de aninhamento |
| `schema/invalid` | Não segue o schema DTCG 2025.10 (um `$value` com formato errado, um `$type` desconhecido, um nome começando com `$`…) |
| `reference/broken` | Um alias (`{color.primery}`), um `$extends` ou um `$ref` de resolver aponta para algo que não existe |
| `reference/cycle` | Aliases ou `$extends` que andam em círculo (`color.a → color.b → color.a`) |
| `reference/too-deep` | Uma cadeia de `$extends` com mais de 64 passos |
| `reference/type-mismatch` | Um alias aponta para um token de outro tipo (um `dimension` cujo valor é uma `color`) |
| `token/no-type` | Um token sem `$type`, nem herdado do grupo nem do token para o qual aponta |
| `resolver/unknown-default` | Um modificador de resolver cujo `default` não é um dos seus contextos |
| `resolver/missing-source`, `resolver/outside-root` | Um resolver aponta para um arquivo que não existe, ou que fica fora do projeto |

Quando um arquivo não segue o schema, as regras de referência são puladas para ele: só repetiriam o mesmo erro.

## O que ele mostra

Uma linha por problema, com o arquivo, a regra, o lugar no arquivo como [JSON pointer](https://www.rfc-editor.org/rfc/rfc6901) e a mensagem:

```
design-tokens/brand.tokens.json	error	reference/cycle	/color/b/$value	alias cycle: color.a → color.b → color.a
design-tokens/brand.tokens.json	error	reference/broken	/color/link/$value	{color.primery} does not exist
design-tokens/brand.tokens.json	error	reference/type-mismatch	/space/m/$value	expected dimension, but {color.primary} is color
1 file checked; 3 problems
```

A última linha vai para a saída de erro. Sem arquivos de tokens, ele diz `No token files found (*.tokens.json, *.resolver.json)` e termina com `0`.

## Opções

| Opção | O que faz |
|---|---|
| `--json` | Mostra `{ schemaVersion, root, files, problems }` ([Saída JSON](json-output.md#validate---json)) |
| `--config <file>` | Arquivo de configuração (padrão: `tokentidy.config.json` no projeto) |

## Código de saída

`0` quando nenhum problema foi encontrado, `1` quando há pelo menos um, `2` para erro de uso (um caminho que não existe). Veja [Códigos de saída](exit-codes.md).

Os arquivos que o `generate` grava sempre passam no `validate`, temas incluídos.
