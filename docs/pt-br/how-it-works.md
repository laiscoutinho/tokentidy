# Como funciona

> 🇺🇸 Para ler este arquivo em inglês, [clique aqui](../how-it-works.md).

```
  Código do projeto
        │
        ▼
 ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
 │  1. Ler o    │ ──▶ │ 2. Entender  │ ──▶ │ 3. Comparar  │
 │  projeto     │     │ o código(AST)│     │ com tokens   │
 └──────────────┘     └──────────────┘     └──────┬───────┘
                                                  │
                                           ┌──────▼───────┐
                                           │ 4. Informar, │
                                           │ sugerir ou   │
                                           │ corrigir     │
                                           └──────────────┘
```

1. **Ler o projeto.** O TokenTidy encontra a raiz do projeto, lê a configuração e lista os arquivos a analisar (veja o [check](check.md#onde-ele-procura)).
2. **Entender o código.** Cada arquivo é lido pela sua estrutura (uma *árvore sintática*), não por busca de texto. Assim o TokenTidy diferencia uma cor de um texto que só parece uma, e sabe a posição exata de cada valor.
3. **Comparar com tokens.** Cada valor é escrito em uma forma padrão única (`#FFF`, `white` e `rgb(255 255 255)` viram `#ffffff`) e comparado com os tokens que o projeto já tem.
4. **Informar, sugerir ou corrigir.** O [`check`](check.md) lista, o [`generate`](generate.md) cria tokens, o [`fix`](fix.md) troca valores, editando só o trecho exato de cada arquivo.

## Contexto

Um valor sozinho não diz se deveria ser um token. O TokenTidy olha **o que o valor está fazendo**:

- **O mesmo valor pode querer dizer coisas diferentes.** `width: 800px` definindo a largura máxima do conteúdo da página é uma decisão de layout, e candidata a token (`--layout-max-width`). O mesmo `800px` como largura de um card é outra decisão, e não é juntado com a primeira só porque o número é igual.
- **Valores diferentes podem querer dizer a mesma coisa.** Um `max-width` repetido nos containers das páginas com valores um pouco diferentes provavelmente é uma decisão escrita de vários jeitos.
- **O contexto vem do próprio código:** a propriedade, o seletor, as declarações ao lado e quantas vezes o valor se repete no mesmo papel.

## Princípios

- Nada é alterado sem um pedido explícito, e o `--dry-run` mostra as mudanças antes.
- Toda sugestão vem com um motivo.
- A mesma entrada sempre gera a mesma saída.
- Um arquivo quebrado nunca interrompe a análise dos outros.
- O TokenTidy não coleta dados de uso e não envia nada para fora da sua máquina.
