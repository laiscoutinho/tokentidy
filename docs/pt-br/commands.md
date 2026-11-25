# Comandos

> 🇺🇸 Para ler este arquivo em inglês, [clique aqui](../commands.md).

Todos os comandos do TokenTidy, com link para a página de cada um. Em um projeto onde o TokenTidy está instalado, coloque `npx` antes de cada comando (`npx tokentidy check`).

## Disponíveis agora

| Comando | O que faz | Página |
|---|---|---|
| `tokentidy check [paths...]` | Lista os valores visuais fixos no código | [check](check.md) |
| `tokentidy generate [paths...]` | Transforma valores repetidos em design tokens | [generate](generate.md) |
| `tokentidy fix [paths...]` | Troca valores por tokens de mesmo valor (e, com `--approximate`, valores próximos que você autoriza) | [fix](fix.md) |
| `tokentidy validate [paths...]` | Verifica arquivos de tokens e de resolver DTCG: schema, aliases quebrados, ciclos, tipos | [validate](validate.md) |
| `tokentidy --help` | Mostra os comandos, as opções e exemplos | abaixo |
| `tokentidy --version` | Mostra a versão instalada | abaixo |

`[paths...]` são arquivos ou pastas a analisar. Sem eles, a pasta atual é usada.

Para vê-los rodando, passo a passo, vá para [Exemplos](examples.md). Vários apps de uma vez estão em [Micro-frontends](micro-frontends.md), e tokens claro/escuro em [Temas](themes.md).

## Como eles trabalham juntos

```
check     lista os valores               não muda nada
   ↓
generate  cria os tokens                 grava só em design-tokens/
   ↓
fix       troca os valores por tokens    muda o seu código

validate  confere os arquivos de tokens  não muda nada
```

O `check`, o `generate` e o `fix` começam do mesmo jeito: encontram a raiz do projeto, leem a configuração, listam os arquivos e os analisam. Por isso, o resultado do `check` e os valores que o `generate` e o `fix` enxergam são os mesmos.

| Comando | Lê | Grava | Termina com `1` quando |
|---|---|---|---|
| `check` | O código e os tokens existentes | Nada | Há violações ou erros de sintaxe |
| `generate` | O código e os tokens existentes | A pasta de tokens (nada com `--dry-run`, ou se nenhum valor se qualificar) | Um arquivo tem erro de sintaxe |
| `fix` | O código, os tokens existentes e a pasta de tokens | O código (nada com `--dry-run`), e o `tokentidy.decisions.json` com `--approximate` | Sobram violações ou erros de sintaxe |
| `validate` | Os arquivos `*.tokens.json` e `*.resolver.json` | Nada | Um arquivo de tokens tem um problema |

Qualquer um deles termina com `2` em um erro de uso, como uma opção desconhecida ou um caminho que não existe ([Códigos de saída](exit-codes.md)).

### Ajuda

`tokentidy` sem argumentos mostra uma tela de boas-vindas: o banner, a versão e os três passos (`check`, `generate`, `fix`). `tokentidy --help` mostra a lista de comandos, as opções e exemplos de uso. Também funciona para um comando só:

```bash
npx tokentidy --help
npx tokentidy check --help
npx tokentidy generate --help
npx tokentidy fix --help
npx tokentidy validate --help
```

### Versão

`tokentidy --version` (ou `-V`) mostra a versão instalada, como `0.1.0`.

## Todas as opções

| Opção | Comandos | O que faz |
|---|---|---|
| `--json` | todos | Mostra o resultado em JSON, para scripts ([Saída JSON](json-output.md)) |
| `--config <file>` | todos | Usa outro arquivo de configuração ([Configuração](configuration.md)) |
| `--dry-run` | `generate`, `fix` | Mostra o que seria gravado, sem gravar nada |
| `--min-occurrences <n>` | `generate` | Usos necessários para um valor virar token (padrão 3, mínimo 2) |
| `--out <dir>` | `generate` | Pasta de saída, dentro do projeto (padrão: `design-tokens`) |
| `--extend` | `generate` | Mantém os nomes gerados antes e adiciona os novos |
| `--new` | `generate` | Esquece a saída anterior e dá nome a tudo de novo |
| `--dtcg`, `--scss`, `--less` | `generate` | Também grava `tokens.tokens.json`, `_tokens.scss` ou `_tokens.less` (o `tokens.css` é sempre gravado) |
| `--ts`, `--js` | `generate` | Também grava o módulo `tokens.ts` ou `tokens.js`, para JS que precisa dos valores |
| `--shared <dir>` | `generate` | Micro-frontends: uma pasta de tokens compartilhada e uma por app ([Micro-frontends](micro-frontends.md)) |
| `--tokens <dir>` | `fix` | Pasta com os tokens gerados (padrão: `output` da configuração, `design-tokens`) |
| `--approximate` | `fix` | Também troca valores próximos de um token, quando as guardas de coerência permitem |
| `--yes` / `--no-input` | `fix` | Com `--approximate`: aplicar sem perguntar / só listar |
| `--format <format>` | `check` | `table` (uma tabela por arquivo, o padrão num terminal), `text` (separado por tabulação, o padrão em pipes) ou `github` |
| `--baseline <file>`, `--print-baseline`, `--summary`, `--review` | `check` | Veja o [check](check.md#opções) |

## Versão

O TokenTidy está na versão `0.x`: uma correção sobe o último número (`0.1.1`), e um recurso novo ou uma mudança que quebra algo sobe o do meio (`0.2.0`). Os nomes ainda podem mudar até a `1.0.0`.
