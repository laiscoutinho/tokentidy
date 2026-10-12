# Comandos do TokenTidy

Este arquivo lista todos os comandos do TokenTidy: os que já funcionam e os que estão previstos no [guia de desenvolvimento](guia-desenvolvimento.md). Atualize-o sempre que um comando novo for implementado.

**Legenda:** 🟢 Funciona · ⚪ Planejado (o nome pode mudar)

---

## Instalação local

Rode estes comandos na raiz do projeto (`tokentidy/`):

| Comando | O que faz |
|---|---|
| `npm install` | Baixa as dependências listadas no `package.json` para a pasta `node_modules` |
| `npm run build` | Compila `src/` (TypeScript) para `dist/` (JavaScript), que é o que o comando `tokentidy` executa |
| `npm link` | Cria o comando global `tokentidy`, que aponta para o `dist/` do projeto. Precisa rodar só uma vez, ou de novo se você trocar a versão do Node pelo nvm |
| `npm unlink -g tokentidy` | Remove o comando global `tokentidy` |

O `npm link` aponta para o `dist/`, então depois de mudar o código rode `npm run build` (ou deixe `npm run build:watch` aberto num terminal, que recompila a cada mudança).

Sem build nem link, dá para rodar direto do código-fonte: `npm run dev -- check ./src` (o Node executa os `.ts` sozinho).

---

## Testar como usuário (instalação real)

O `npm link` usa a pasta inteira do projeto, então esconde problemas como um arquivo que ficou fora do pacote ou uma dependência não declarada. Para simular alguém instalando o TokenTidy no projeto dele, use o `npm pack`, que gera o mesmo pacote que iria para o npm:

```bash
# 1. Na raiz de tokentidy/: compila e gera o arquivo tokentidy-0.0.1.tgz
npm pack

# 2. No projeto de teste (tokentidy/teste-tokentidy/, ignorado pelo git): instala o pacote como dependência de desenvolvimento
cd teste-tokentidy
npm install -D ../tokentidy-0.0.1.tgz

# 3. Usa como o usuário usaria
npx tokentidy --help
npx tokentidy check .
```

| Comando | O que faz |
|---|---|
| `npm pack --dry-run` | Lista os arquivos que iriam no pacote, sem gerar o `.tgz` |
| `npm pack` | Gera o `.tgz` (ignorado pelo git) |
| `npx tokentidy` | Roda o comando instalado em `node_modules/.bin` do projeto de teste |

O `npm pack` roda o build sozinho antes (script `prepare`, que também roda no `npm install` e na instalação direto do GitHub). O que entra no pacote é definido pelo campo `"files"` do `package.json`: só a pasta `dist/` (JavaScript compilado e tipos). O `README.md` e o `package.json` entram sempre.

Diferente do `npm link`, o pacote é uma cópia: depois de mudar o código, rode `npm pack` e o `npm install -D` de novo.

---

## Comandos da ferramenta

### 🟢 `tokentidy check <dir>`

Varre o diretório informado e conta quantos arquivos existem de cada extensão que o TokenTidy vai analisar: `.css`, `.scss`, `.html`, `.js`, `.jsx`, `.ts` e `.tsx`.

Ignora as pastas `node_modules`, `dist`, `build`, `.git` e `coverage`.

```bash
tokentidy check ./src          # pasta relativa
tokentidy check .              # pasta atual
tokentidy check ~/projetos/app # caminho absoluto
```

A saída é só o dado, uma linha por extensão (extensão e quantidade separadas por tab), seguindo a filosofia UNIX:

```
.css	3
.scss	2
.html	0
.js	1
.jsx	5
.ts	0
.tsx	0
total	11
```

Por isso dá para combinar com outros comandos do terminal:

```bash
tokentidy check ./src | grep -v "0$"     # só as extensões que têm arquivos
tokentidy check ./src | sort -k2 -n -r   # ordena pela quantidade
```

Se o diretório não existir, mostra `Erro: Diretório não encontrado`; se o caminho for um arquivo, mostra `Erro: Não é um diretório`. Nos dois casos termina com código de saída 1.

> Na Fase 0 o `check` só conta arquivos. Nas próximas fases ele vai passar a abrir cada arquivo e listar os valores soltos encontrados.

### 🟢 `tokentidy check <dir> --json`

Faz o mesmo que o `check`, mas imprime o resultado em JSON. Serve para outro programa ler o resultado (um script, o CI, outra ferramenta).

```bash
tokentidy check ./src --json
tokentidy check ./src --json > resultado.json   # salva em arquivo
```

### 🟢 `tokentidy` (sem nada) ou `tokentidy --help`

Mostra o banner "TokenTidy", a lista de comandos, as opções e exemplos de uso. Também funciona para um comando específico:

```bash
tokentidy --help
tokentidy check --help
```

### 🟢 `tokentidy --version`

Mostra a versão da ferramenta, lida do campo `version` do `package.json`. Atalho: `tokentidy -V`.

---

## Comandos planejados

| Comando | Fase | O que vai fazer |
|---|---|---|
| ⚪ `tokentidy check <dir>` (listando valores) | 2 a 4 | Abrir cada arquivo e listar os valores soltos (cores, espaçamentos, tipografia) com arquivo, linha, coluna e categoria. CSS/SCSS na Fase 2, `style={{...}}` do React na Fase 3 e Angular na Fase 4 |
| ⚪ `tokentidy check <dir> --tokens <arquivo>` | 5 e 6 | Ler um arquivo de tokens no formato DTCG e sugerir, para cada valor solto, o token igual ou o mais próximo, explicando o motivo |
| ⚪ `tokentidy check <dir> --dry-run` | 7 | Mostrar o que seria trocado pelo autofix, sem alterar nenhum arquivo |
| ⚪ `tokentidy check <dir> --fix` | 7 | Trocar nos arquivos os valores soltos pelos tokens (por exemplo, `#ff0000` vira `var(--color-danger)`). Por padrão, só troca valores idênticos a um token |
| ⚪ `tokentidy check <dir> --fix-approximate` | 7 | Também trocar valores apenas parecidos com um token (por exemplo, `15px` para o token de `16px`) |
| ⚪ `tokentidy generate <dir>` | 9 | Para projetos sem arquivo de tokens: agrupar os valores repetidos e gerar um arquivo de tokens com nomes semânticos. Por padrão, só mostra o resultado; grava apenas com confirmação ou com uma flag |
| ⚪ `tokentidy check <dir> --quiet` | 10 | Mostrar só o essencial (útil no CI) |
| ⚪ Arquivo de configuração | 10 | Salvar no projeto o caminho dos tokens, as extensões, as tolerâncias e as pastas ignoradas, para não precisar repetir flags |

### Códigos de saída (planejado para a Fase 10)

| Código | Significado |
|---|---|
| `0` | Tudo certo, nenhum valor solto encontrado |
| `1` | Foram encontrados valores soltos |
| `2` | Erro de uso ou de execução (pasta inexistente, arquivo de tokens inválido…) |

Hoje o `check` retorna `1` para qualquer erro. Para ver o código de saída no terminal: `tokentidy check ./src; echo $?`.

---

## Comandos de desenvolvimento

| Comando | O que faz |
|---|---|
| `npm run dev -- check ./src` | Roda a CLI direto do código TypeScript, sem build. O `--` separa as opções do npm das da CLI |
| `npm test` | Roda os testes de `test/` (`*.test.ts`) |
| `npm run typecheck` | Checa os tipos de `src/` e `test/` sem gerar arquivos |
| `npm run check` | Checagem de tipos + testes (o que o CI vai rodar) |
| `npm run build` | Compila `src/` para `dist/` |
| `npm run build:watch` | Recompila a cada mudança (útil com o `npm link`) |
