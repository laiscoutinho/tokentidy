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

## Opções comuns aos comandos

| Opção | Comandos | O que faz |
|---|---|---|
| `--json` | os três | Mostra o resultado em JSON, para scripts ([Saída JSON](json-output.md)) |
| `--config <file>` | os três | Usa outro arquivo de configuração ([Configuração](configuration.md)) |
| `--dry-run` | `generate`, `fix` | Mostra o que seria gravado, sem gravar nada |

## Em breve

O TokenTidy está na versão `0.0.x`: cada recurso novo é uma versão patch, e a `0.1.0` será a primeira com todos os recursos planejados. Os nomes ainda podem mudar.

| Recurso | O que vai fazer |
|---|---|
| Propriedades de tamanho | `width`/`height` de controles, ícones e avatares como `size`, containers, `min-height` |
| Tokens desatualizados | Valores sem token divididos entre *usados uma vez* e *repetidos sem token* (a pasta de tokens está desatualizada) |
| Expressões SCSS/Less | Argumentos e padrões de mixins, mapas `mat.*-overrides` |
| Objetos de estilo em JS/TS, CSS-in-JS | Objetos de estilo fora do `style={{}}`; styled-components, Emotion, `sx` |
| React Native, mais Angular | `StyleSheet.create`; `host`, `@HostBinding`, `Renderer2.setStyle` |
| Busca de tokens no `check` | Diz se já existe um token para um valor, e encontra referências a tokens que não existem |
| `fix --approximate` | Também troca valores só próximos de um token (`15px` → o token de `16px`), perguntando antes |
| Vários apps de uma vez | Micro-frontends: desvios entre apps, colisões no `:root`, um pacote de tokens compartilhado |
| `tokentidy validate <file>` | Verifica um arquivo DTCG: schema, aliases quebrados e ciclos |
| `--summary`, `--format github` | Totais por regra; anotações do GitHub para o CI |
| Temas | Tokens semânticos claro/escuro |
