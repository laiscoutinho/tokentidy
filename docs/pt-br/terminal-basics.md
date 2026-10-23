# Noções de terminal

> 🇺🇸 Para ler este arquivo em inglês, [clique aqui](../terminal-basics.md).

O TokenTidy não tem janela nem botões: ele é usado digitando comandos em um **terminal**. Se você nunca usou um, esta página tem tudo o que precisa para acompanhar o resto da documentação.

## O que é um terminal

Um terminal é uma janela onde você digita um comando, aperta <kbd>Enter</kbd> e lê a resposta em texto. Todo comando roda **dentro de uma pasta** (a *pasta atual*), e a maioria dos comandos trabalha com os arquivos dessa pasta.

## Abrindo um terminal

| Onde | Como |
|---|---|
| VS Code | Menu **Terminal → New Terminal**. Ele já abre dentro da pasta do projeto |
| Windows | Menu Iniciar → **Terminal** (ou **PowerShell**) |
| macOS | <kbd>Cmd</kbd> + <kbd>Espaço</kbd>, digite **Terminal**, aperte <kbd>Enter</kbd> |
| Linux | <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>T</kbd> na maioria das distribuições |

O jeito mais fácil é o VS Code: abra o projeto e depois o terminal, e você já está no lugar certo.

## Navegando entre pastas

| O que você quer | macOS / Linux | Windows (PowerShell) |
|---|---|---|
| Ver em qual pasta você está | `pwd` | `pwd` |
| Listar os arquivos da pasta | `ls` | `ls` ou `dir` |
| Entrar em uma pasta | `cd meu-projeto` | `cd meu-projeto` |
| Voltar uma pasta | `cd ..` | `cd ..` |

Rode o TokenTidy na **pasta do seu projeto**: a que tem o arquivo `package.json`.

## Lendo um comando

Os comandos desta documentação têm esta cara:

```bash
npx tokentidy check src --json
```

| Parte | Significado |
|---|---|
| `npx` | Roda uma ferramenta instalada no projeto (vem junto com o Node.js) |
| `tokentidy` | A ferramenta |
| `check` | O **comando**: o que você quer que o TokenTidy faça |
| `src` | Um **argumento**: aqui, a pasta a analisar. Opcional; sem ele, a pasta atual é usada |
| `--json` | Uma **opção** (sempre começa com `--`): muda o comportamento do comando |

Nos exemplos, `[paths...]` quer dizer "zero ou mais caminhos" e `<n>` quer dizer "coloque um valor aqui". Um trecho que começa com `#` depois de um comando é um comentário para você ler; não precisa digitar.

## Saída e erros

Um comando pode escrever em dois lugares, os dois mostrados no terminal:

- **saída padrão** (*stdout*): o resultado em si, como a lista de valores encontrados;
- **saída de erro** (*stderr*): resumos, avisos e erros.

Na tela eles parecem iguais. A diferença só importa quando outro programa lê o resultado: ele lê o *stdout* e recebe dados limpos. Veja [Scripts e CI](ci-and-scripts.md).

Quando um comando termina, ele também devolve um número chamado **código de saída**: `0` quer dizer que deu tudo certo, outros números querem dizer que algo foi encontrado ou deu errado. Veja [Códigos de saída](exit-codes.md).

## Teclas úteis

| Tecla | O que faz |
|---|---|
| <kbd>↑</kbd> | Traz de volta o comando anterior |
| <kbd>Tab</kbd> | Completa o nome de um arquivo ou pasta |
| <kbd>Ctrl</kbd> + <kbd>C</kbd> | Interrompe o comando que está rodando |

## Próximo passo

[Instale o TokenTidy](installation.md).
