# Códigos de saída

> 🇺🇸 Para ler este arquivo em inglês, [clique aqui](../exit-codes.md).

Quando um comando termina, ele devolve um número, o **código de saída**. Você não o vê na tela, mas serviços de CI, hooks de pre-commit e scripts usam esse número para saber se a etapa passou.

| Código | Significado |
|---|---|
| `0` | Tudo certo: nenhuma violação (`check`; itens de revisão e avisos não contam), tokens gerados (`generate`), nada mais para corrigir (`fix`) |
| `1` | Foram encontrados valores fixos no código (`check`) ou eles sobraram depois do `fix`, ou um arquivo tem erro de sintaxe |
| `2` | Erro de uso ou de execução: caminho inexistente, opção desconhecida, configuração inválida, pasta de saída fora do projeto, arquivo de tokens corrompido, arquivos de tokens existentes sem `--extend`/`--new` fora de um terminal |

## Vendo o código

Rode o comando e depois:

| Terminal | Comando |
|---|---|
| macOS / Linux | `echo $?` |
| Windows PowerShell | `echo $LASTEXITCODE` |

```bash
npx tokentidy check ./src; echo $?
```

## Por que isso importa

Como o `check` termina com `1` quando aparece um valor fixo no código, um job de CI ou um hook de pre-commit que o roda falha naquele momento. Veja [Scripts e CI](ci-and-scripts.md).
