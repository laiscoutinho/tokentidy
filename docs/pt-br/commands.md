# Comandos

> 🇺🇸 Para ler este arquivo em inglês, [clique aqui](../commands.md).

Todos os comandos do TokenTidy, com link para a página de cada um. Em um projeto onde o TokenTidy está instalado, coloque `npx` antes de cada comando (`npx tokentidy check`).

## Disponíveis agora

| Comando | O que faz | Página |
|---|---|---|
| `tokentidy check [paths...]` | Lista os valores visuais fixos no código | [check](check.md) |
| `tokentidy generate [paths...]` | Transforma valores repetidos em design tokens | [generate](generate.md) |
| `tokentidy fix [paths...]` | Troca valores por tokens de exatamente o mesmo valor | [fix](fix.md) |
| `tokentidy --help` | Mostra os comandos, as opções e exemplos | abaixo |
| `tokentidy --version` | Mostra a versão instalada | abaixo |

`[paths...]` são arquivos ou pastas a analisar. Sem eles, a pasta atual é usada.

Para vê-los rodando, passo a passo, vá para [Exemplos](examples.md).

## Como eles trabalham juntos

```
check     lista os valores               não muda nada
   ↓
generate  cria os tokens                 grava só em design-tokens/
   ↓
fix       troca os valores por tokens    muda o seu código
```

Os três começam do mesmo jeito: encontram a raiz do projeto, leem a configuração, listam os arquivos e os analisam. Por isso, o resultado do `check` e os valores que o `generate` e o `fix` enxergam são os mesmos.

| Comando | Lê | Grava | Termina com `1` quando |
|---|---|---|---|
| `check` | O código e os tokens existentes | Nada | Há violações ou erros de sintaxe |
| `generate` | O código e os tokens existentes | A pasta de tokens (nada com `--dry-run`, ou se nenhum valor se qualificar) | Um arquivo tem erro de sintaxe |
| `fix` | O código, os tokens existentes e a pasta de tokens | O código (nada com `--dry-run`) | Sobram violações ou erros de sintaxe |

Qualquer um deles termina com `2` em um erro de uso, como uma opção desconhecida ou um caminho que não existe ([Códigos de saída](exit-codes.md)).

### Ajuda

`tokentidy` sem argumentos, ou `tokentidy --help`, mostra o banner do TokenTidy, a lista de comandos, as opções e exemplos de uso. Também funciona para um comando só:

```bash
npx tokentidy --help
npx tokentidy check --help
npx tokentidy generate --help
npx tokentidy fix --help
```

### Versão

`tokentidy --version` (ou `-V`) mostra a versão instalada, como `0.0.9`.

## Todas as opções

| Opção | Comandos | O que faz |
|---|---|---|
| `--json` | os três | Mostra o resultado em JSON, para scripts ([Saída JSON](json-output.md)) |
| `--config <file>` | os três | Usa outro arquivo de configuração ([Configuração](configuration.md)) |
| `--dry-run` | `generate`, `fix` | Mostra o que seria gravado, sem gravar nada |
| `--min-occurrences <n>` | `generate` | Usos necessários para um valor virar token (mínimo 2) |
| `--out <dir>` | `generate` | Pasta de saída, dentro do projeto (padrão: `design-tokens`) |
| `--extend` | `generate` | Mantém os nomes gerados antes e adiciona os novos |
| `--new` | `generate` | Esquece a saída anterior e dá nome a tudo de novo |
| `--tokens <dir>` | `fix` | Pasta com os tokens gerados (padrão: `output` da configuração, `design-tokens`) |

## Em breve

O TokenTidy está na versão `0.0.x`: cada recurso novo é uma versão patch, e a `0.1.0` será a primeira com todos os recursos planejados. Os nomes ainda podem mudar.

| Recurso | O que vai fazer |
|---|---|
| `fix --approximate` | Também troca valores só próximos de um token (`15px` → o token de `16px`), perguntando antes |
| Vários apps de uma vez | Micro-frontends: desvios entre apps, colisões no `:root`, um pacote de tokens compartilhado |
| `tokentidy validate <file>` | Verifica um arquivo DTCG: schema, aliases quebrados e ciclos |
| Temas | Tokens semânticos claro/escuro |
