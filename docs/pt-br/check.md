# O comando `check`

> 🇺🇸 Para ler este arquivo em inglês, [clique aqui](../check.md).

O `check` analisa o projeto e lista os **valores fixos no código** (*hardcoded*): valores visuais escritos direto no código em vez de usar um token. Ele nunca altera um arquivo.

```bash
npx tokentidy check                           # pasta atual
npx tokentidy check src/components            # uma pasta
npx tokentidy check src/Card.css src/App.tsx  # arquivos específicos
npx tokentidy check ~/projetos/app            # caminho absoluto
```

## Lendo o resultado

Cada linha é um valor, com cinco campos separados por tabulação, e um sexto quando um token serve para o valor:

```
src/App.jsx:29:28	violation	color/hardcoded	color	#4f46e5
src/App.jsx:29:72	violation	font-weight/hardcoded	font-weight	bold
src/App.jsx:31:12	review	size/no-context	width	120
src/App.scss:8:8	violation	spacing/hardcoded	gap	10px
src/Card.css:4:12	violation	color/hardcoded	color	#4f46e5	--color-primary
```

| Campo | Exemplo | Significado |
|---|---|---|
| Posição | `src/App.jsx:29:28` | Arquivo, linha e coluna (as duas começam em 1). O terminal e o VS Code transformam isso em link clicável |
| Severidade | `violation` | `violation` (violação): deveria ser um token. `review` (revisão): precisa de uma decisão humana |
| Regra | `color/hardcoded` | O que foi encontrado ([Regras](rules.md)) |
| Propriedade | `color` | Sempre na forma do CSS (`margin-bottom`), mesmo quando escrita `marginBottom` no JSX |
| Valor | `#4f46e5` | O valor como foi escrito |
| Token | `--color-primary` | Opcional: o token para este valor ([abaixo](#qual-token-serve)) |

O caminho é relativo à pasta onde você rodou o comando. O resumo vai para a saída de erro, para os dados continuarem limpos para scripts:

```
57 violations, 9 review in 3 files; 3 ignored by comment; 1 file skipped
```

Violações fazem o `check` terminar com código de saída `1`; itens de revisão nunca fazem ([Códigos de saída](exit-codes.md)).

Com vários apps em um repositório, o `check` também os compara: veja [Micro-frontends](micro-frontends.md).

## Qual token serve

O `check` procura cada violação entre os tokens que o projeto define e os da pasta de tokens (`design-tokens/`, ou `output` na configuração). Ele usa a mesma decisão do `fix`, então nunca cita um token que o `fix` não usaria. Ele só lê: para aplicar a mudança, rode o [`fix`](fix.md).

| Sexto campo | Significado | O `fix` troca? |
|---|---|---|
| `--color-primary` | Mesmo valor, e o token funciona neste arquivo | Sim |
| `--a-gap (or --b-gap)` | Dois tokens com o mesmo valor, igualmente usados: você escolhe | Não, é pulado como `ambiguous-token` |
| `--spacing-4 (+1px)` | Nenhum token tem este valor, mas `15px` está fora do grid e um token no grid está a 1px | Não |
| `--brand (ΔE 0.012)` | Nenhum token tem esta cor, mas um é quase igual (ΔEOK até 0,02) | Não |

Os tokens podem vir de mais lugares além das suas folhas de estilo:

| Fonte | Exemplo | Sexto campo |
|---|---|---|
| Um pacote de design system que seus estilos carregam do `node_modules` (`@use "@acme/tokens" as *;`, `@import`) | `$brand: #4f46e5;` no pacote | `$brand` |
| Um tema JS (`createTheme({...})`, `<ThemeProvider theme={...}>`), só valores em texto | `palette: { primary: { main: '#0ea5e9' } }` | `theme.palette.primary.main`: só uma dica, o `fix` não escreve caminhos de tema |
| Um arquivo DTCG escrito à mão (`*.tokens.json`) | `color.primary` | `--color-primary` |

Do pacote, só as definições são lidas: o CSS dele não é o seu código, então nada nele é informado.

Quando um valor já usa um token primitivo mas existe um alias semântico para aquele papel, uma linha `suggestion` aponta o alias. Ela nunca falha, e o `fix` não muda referências que já existem:

```
src/b.css:2:21	suggestion	token/prefer-alias	color	--color-red-500	--color-text-danger
```

Valor próximo é só uma dica: parecer igual não faz dele a mesma decisão de design. Para trocar valores próximos, use o [`fix --approximate`](fix.md#valores-próximos-de-um-token---approximate), que pergunta antes e confere as guardas de coerência. Medidas só são comparadas quando estão fora do grid (`gridBase` na configuração), então `16px` perto de um token de `12px` não sugere nada. Dois tokens à mesma distância também não.

Quando a pasta de tokens existe e valores repetidos não têm token, o resumo avisa, porque o código mudou depois do `generate`:

```
2 repeated values have no token yet; run tokentidy generate --extend
```

## Avisos sobre tokens

Eles vão para a saída de erro, no mesmo formato `arquivo:linha:coluna`, e nunca mudam o código de saída.

| Regra | Quando | Exemplo |
|---|---|---|
| `token/unknown` | Um `var(--x)` cita uma custom property que ninguém define, e exatamente um nome definido está a no máximo 2 letras de distância | `--color-primry is not defined; did you mean --color-primary?` |
| `token/deprecated` | Um token marcado `$deprecated` em um arquivo DTCG é usado. O `fix` nunca o escreve | `--color-old is deprecated: use color.new` |
| `token/fallback-mismatch` | O valor reserva em `var(--gap, 12px)` difere de todos os valores do token, então a tela muda se o token não carregar | `fallback 12px differs from --gap (16px, tokens.css:1)` |
| `baseline/stale` | O [baseline](#adotar-em-um-projeto-que-já-tem-violações) lista valores que um arquivo não tem mais | `2 baselined values are no longer here; …` |

Só nomes `--x` são verificados contra erro de digitação: um `$x` ou `@x` inexistente já quebra o build, e variáveis de laço pareceriam desconhecidas. Vários nomes próximos indicam uma escala (`--spacing-4`, `--spacing-6`), não um erro de digitação, então nada é dito.

Em uma execução sobre o projeto inteiro, o resumo também conta as custom properties que ninguém usa (o `--json` as lista em `unusedTokens`). Isso nunca é erro: um token pode ser usado de fora dos arquivos analisados. Variáveis Sass e Less não entram na conta, porque podem ser usadas em lugares que o TokenTidy ainda não lê, como argumentos de `@include`.

## Adotar em um projeto que já tem violações

Um baseline é uma fotografia das violações atuais, para o CI falhar só nas novas.

```bash
npx tokentidy check --print-baseline > tokentidy.baseline.json   # termina com 0
npx tokentidy check --baseline tokentidy.baseline.json           # falha só no que é novo
```

O arquivo conta as violações por arquivo, regra, propriedade e valor normalizado, sem números de linha: adicionar uma linha acima de um valor ou mover um bloco não muda nada. Um terceiro `margin: 13px` em um arquivo cujo baseline tem dois é novo. Quando valores somem, um aviso `baseline/stale` pede para atualizar o arquivo. O `generate` e o `fix` ignoram o baseline.

## Em que pé está o projeto

`tokentidy check --summary` mostra uma linha por tipo de token, separada por tabs: tipo, valores ainda soltos, usos de um token.

```
color	12	87
spacing	40	15
```

Ficam dois números de propósito: uma nota única esconderia que as cores estão em dia e o espaçamento não. A contagem inclui o que o baseline esconde, porque aceitar uma dívida não a elimina. Precisa do projeto inteiro, então não pode ser combinado com caminhos. O código de saída é o mesmo de sem a opção.

## Onde ele procura

| Host | Arquivos | O que é lido |
|---|---|---|
| `css` | `.css`, `<style>` em `.html` | toda declaração |
| `scss` | `.scss`, `styles:` do Angular | toda declaração; `$variáveis` são tokens; argumentos de `@include`, padrões de `@mixin` e mapas `mat.*-overrides` |
| `sass` | `.sass` (sintaxe indentada) | toda declaração; `$variáveis` são tokens; argumentos de `@include` e padrões de `@mixin` |
| `less` | `.less` | toda declaração; `@variáveis` são tokens, chamadas de mixin são puladas |
| `html` | `.html` | `style="..."` inline |
| `jsx` | `.jsx`, `.tsx`, `.js`, `.ts`, `.mjs`, `.cjs`, `.mts`, `.cts` | `style={{ ... }}` e objetos que chegam nele (`style={card}`, também de import relativo), `css={{ }}`, `styled.div({ })`, `sx` do MUI, `el.style.x`, `setProperty`, `cssText`, `setAttribute`, `Object.assign(el.style, ...)`, `@HostBinding`, `Renderer2.setStyle` |
| `angular-template` | `template:` do Angular, o `.html` do `templateUrl` e `host:` | `style="..."`, `[style.padding.px]="4"`, `[ngStyle]="{...}"` |
| `css-in-js` | Os mesmos arquivos de script | Templates com tag: `styled.x`, `css`, `keyframes`, `createGlobalStyle`, `injectGlobal` e a prop `css` com template. Um valor com `${...}` dentro não é informado |
| `svg-attribute` | Os mesmos arquivos de script | Atributos de apresentação do SVG em JSX (`fill`, `stroke`, `stopColor`, `floodColor`, `lightingColor`) e `setAttribute('fill' ou 'stroke', ...)`. O `fix` não mexe neles |
| `js-value` | Os mesmos arquivos de script | Cores lidas por JavaScript: `ctx.fillStyle`, opções de `new Chart`/`new ApexCharts` e chaves de cor em objetos passados a funções desconhecidas. O `fix` as escreve a partir do [módulo `tokens.ts`](fix.md#canvas-e-gráficos-o-módulo-tokensts) |

Arquivos `.pcss`/`.postcss` são lidos como CSS. Como no próprio TypeScript, JSX dentro de um `.ts` é erro de sintaxe. Arquivos de tokens (`*.tokens.json`) são lidos como os tokens que o projeto já tem, não como código.

## O que ele pula

Dentro de pastas, ele pula `node_modules`, `dist`, `build`, `.git`, `coverage`, `.angular`, `.next`, `.nuxt`, `out`, pastas ocultas, pastas que são links simbólicos, e arquivos `.d.ts`, `*.spec.*`, `*.test.*` e `*.stories.*`.

**Arquivos são listados, nunca descartados em silêncio.** Arquivos minificados (com nome `*.min.*`, ou com linha média maior que 110 caracteres) e linguagens que o TokenTidy ainda não lê (`.vue`, `.svelte`, `.styl`, `.stylus`) aparecem na saída de erro:

```
src/App.vue	skipped	unsupported
```

Para analisar também os minificados, use `"includeMinified": true`; para pular arquivos ou pastas seus, use `ignore` ([Configuração](configuration.md)). Para aceitar um valor de propósito, use um [comentário de ignore](ignore-comments.md).

## Analisando parte de um projeto

As violações só são informadas para os caminhos que você passa. Tudo o que decide essas violações vem do **projeto inteiro**: onde os tokens são definidos e usados e quais `.html` são templates Angular. Assim, `check src/a` e `check .` concordam sobre os arquivos de `src/a`.

Ler o resto do projeto custa quase o mesmo que uma execução completa, sem imprimi-lo. No `--json`, `partial` vem `true` nessas execuções.

## Raiz do projeto

Os caminhos podem ser arquivos ou pastas. O TokenTidy encontra a **raiz do projeto**: a pasta mais próxima acima deles que tenha `package.json`, `tokentidy.config.json` ou `.git`. A configuração é lida de lá.

- Um arquivo passado pelo nome é analisado mesmo que a varredura de uma pasta o pulasse (`Button.test.tsx`).
- Um caminho que não existe para com `Error: Path not found: <path>` e código de saída `2`.
- Um caminho sem nada para analisar mostra `No supported files in <path>` e termina com `0`.

## Arquivos com erro

Um arquivo com erro de sintaxe é informado na saída de erro, e os outros arquivos continuam sendo analisados:

```
src/broken.css:2:14	syntax error	Missed semicolon
```

## Saída segura

Valores, caminhos e mensagens na saída em texto têm caracteres de controle escapados (`\u001b`), então um arquivo não consegue mover o cursor nem falsificar um link no seu terminal. O `--json` mantém o texto exato.

## Opções

| Opção | O que faz |
|---|---|
| `--json` | Mostra o resultado em JSON ([Saída JSON](json-output.md)) |
| `--config <file>` | Arquivo de configuração (padrão: `tokentidy.config.json` na raiz do projeto) |
| `--baseline <file>` | Só informa violações que não estão neste arquivo de baseline |
| `--print-baseline` | Mostra na saída padrão um baseline das violações atuais e termina com `0` |
| `--summary` | No lugar da lista: por tipo de token, quantos valores estão soltos e quantos usos passam por um token (veja [acima](#em-que-pé-está-o-projeto)) |
| `--format <format>` | `text` (padrão) ou `github`: anotações para o [GitHub Actions](ci-and-scripts.md#anotações-no-pull-request) |

## Veja também

- [Regras](rules.md): o que cada regra quer dizer e o que não é informado
- [Scripts e CI](ci-and-scripts.md): filtrar o resultado e fazer um build falhar
