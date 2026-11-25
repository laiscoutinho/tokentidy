# Instalação

> 🇺🇸 Para ler este arquivo em inglês, [clique aqui](../installation.md).

Nunca usou o terminal? Leia [Noções de terminal](terminal-basics.md) antes.

## 1. Confira o Node.js

O TokenTidy precisa do **Node.js 22.20 ou mais recente**. Em um terminal, rode:

```bash
node --version
```

Se aparecer `v22.20.0` ou um número maior (`v24.x`, por exemplo), está tudo pronto. Se disser que o comando não foi encontrado, ou mostrar uma versão menor, instale a versão **LTS** em [nodejs.org](https://nodejs.org/) e abra um terminal novo.

## 2. Instale o TokenTidy no seu projeto

Dentro da pasta do projeto (a que tem o `package.json`), rode:

```bash
npm install -D tokentidy
```

O `-D` instala como **dependência de desenvolvimento**: ele ajuda enquanto você programa e não vai junto no app que os seus usuários baixam.

## 3. Confira se funciona

```bash
npx tokentidy --version
```

Aparece a versão instalada, por exemplo `0.1.0`. Para ver os comandos:

```bash
npx tokentidy --help
```

## Atualizar e remover

| O quê | Comando |
|---|---|
| Atualizar para a versão mais recente | `npm install -D tokentidy@latest` |
| Testar o código ainda não lançado, do GitHub | `npm install -D github:laiscoutinho/tokentidy` |
| Remover o TokenTidy do projeto | `npm uninstall tokentidy` |

## Próximo passo

[Primeiros passos](quick-start.md): sua primeira análise em três comandos.
