# Guia de desenvolvimento: CLI para detectar e corrigir violações de tokens de design

Escopo da ferramenta: CLI em TypeScript/Node para **CSS/SCSS, React (JSX/TSX) e Angular** (sem Tailwind), que detecta valores fixos (cores, espaçamentos, tipografia), sugere o token mais próximo, aplica autofix e, quando não existe arquivo de tokens, gera um.

---

## Como usar este guia

1. Siga as fases **em ordem**. Cada fase depende da anterior.
2. Cada fase tem: objetivo, o que fazer, o que estudar, o que vai precisar, boas práticas, o que **não** fazer, links, exercício e o critério **"Pronta quando"**.
3. Só avance quando todos os itens do "Pronta quando" estiverem marcados **e** você conseguir refazer o exercício sem copiar nada.
4. Mantenha um repositório de experimentos (uma pasta por fase) e um diário curto por fase (modelo no final). Isso vira material para LinkedIn e TCC.
5. Os links marcados com ✅ foram conferidos na pesquisa para este guia; os demais são páginas oficiais conhecidas, vale abrir cada um uma vez.

> **Este guia é a base, não a regra.** Quando uma opção melhor aparece, ela substitui a do guia, e a decisão (com o motivo) fica registrada no [CLAUDE.md](CLAUDE.md). Já substituídas: `tsx` (o Node executa `.ts` direto), `fast-glob` (trocado pelo `fs.glob` do Node, por segurança), `vitest` (trocado pelo `node:test`) e o `chalk` (trocado pelo `util.styleText` do Node).

### Mapa das fases

| Fase | Tema | Entregável | Ritmo sugerido (estimativa) |
|---|---|---|---|
| 0 | TypeScript, Node e esqueleto da CLI | `minha-cli check ./src` conta arquivos por extensão | 1 a 2 semanas |
| 1 | Conceito de AST e parsing | Mapa mental + exercício no astexplorer | 1 semana |
| 2 | Parsing de CSS/SCSS (PostCSS) | Script que lista valores literais com arquivo/linha/coluna | 1 a 2 semanas |
| 3 | Parsing de JSX/TSX | Mesmo relatório para `style={{...}}` | 1 a 2 semanas |
| 4 | Angular | Estilos e templates de `@Component` analisados | 2 semanas |
| 5 | Design tokens como dado | Leitor de arquivo de tokens com índice valor → token | 1 semana |
| 6 | Normalização e valor mais próximo | Sugestão de token com justificativa | 1 a 2 semanas |
| 7 | Autofix | `--fix` e `--dry-run` idempotentes | 1 a 2 semanas |
| 8 | Testes e qualidade | Fixtures, snapshots, testes de CLI, CI | contínuo, formalizar em 1 semana |
| 9 | Geração de tokens (Nickerson) | Arquivo de tokens gerado a partir de um projeto | 2 a 3 semanas |
| 10 | Polimento, documentação e publicação | README, `--json`, versão publicada | 1 a 2 semanas |

> O ritmo é uma estimativa para uma pessoa estudando em paralelo com a graduação. Ajuste à sua rotina.

---

## Regras de ouro (valem para todas as fases)

**Faça sempre**
- Separe **CLI** (argumentos, saída) de **núcleo** (análise). O núcleo precisa ser testável sem terminal.
- Trate todo arquivo como "pode estar quebrado": se o parser falhar, reporte um `parse-error` e **continue** com os outros arquivos.
- Guarde para cada achado: arquivo, linha, coluna, trecho original, tipo (cor, espaçamento...) e posição absoluta (offset). O offset é o que permite o autofix.
- Escreva um teste para cada bug que você corrigir.
- Pare e leia o código-fonte de uma ferramenta de referência quando travar (ver "Referências").

**Nunca faça**
- Nunca analise CSS/JSX/templates com **regex**. Regex serve para validar um valor isolado (ex.: "isto é um hex?"), não para entender a estrutura do arquivo.
- Nunca reescreva o arquivo inteiro a partir da AST se só precisa trocar um valor (você perde formatação e comentários). Edite por posição.
- Nunca altere arquivos do usuário sem `--fix` explícito, e ofereça `--dry-run`.
- Nunca "adivinhe e corrija" valores aproximados em silêncio. Sugira; só autocorrija o que for **exato** (a não ser que o usuário ative uma opção).
- Nunca envie dados de uso/telemetria sem consentimento (diretriz do clig.dev).
- Nunca dependa de `any` no TypeScript para "fazer passar".

---

## Fase 0: TypeScript, Node e esqueleto da CLI

**Objetivo:** ter uma CLI instalável localmente que varre um diretório e conta quantos arquivos de cada extensão existem (`.css`, `.scss`, `.jsx`, `.tsx`, `.ts`, `.html`).

### O que eu devo fazer
1. Instalar uma versão **LTS atual do Node (22 ou superior)** e criar o projeto (`npm init`, `git init`, `.gitignore` com `node_modules` e `dist`).
2. Configurar o TypeScript em modo `strict` com resolução de módulos moderna (`NodeNext`).
3. ~~Rodar TypeScript direto em desenvolvimento com `tsx`~~ → o Node 22.18+ executa `.ts` sozinho (sem build a cada mudança). Para o build final, use `tsc` (mais simples para aprender) ou `tsdown` (bundler atual para bibliotecas/CLIs em TS).
4. Criar `src/cli.ts` com o shebang `#!/usr/bin/env node` e apontar o campo `bin` do `package.json` para o arquivo **compilado**.
5. Usar **commander** (ou `cac`) para criar o comando `check <dir>` com `--help` e `--version`.
6. Varrer arquivos com ~~**fast-glob**~~ o `fs.glob` embutido no Node, ignorando `node_modules`, `dist`, `.git` e pastas de build.
7. Contar por extensão e imprimir o resultado em `stdout`; erros e avisos em `stderr`; código de saída `0` (ok) ou diferente de zero (falha).
8. Rodar `npm link` e executar a CLI de **outra pasta** do computador.

### O que eu vou estudar
- **JavaScript:** módulos (ESM vs CommonJS), `async/await`, `Promise`, arrays/objetos (`map`, `filter`, `reduce`), regex básica.
- **TypeScript:** tipos, interfaces, generics, union types, type guards, `tsconfig.json`.
- **Node:** `fs`, `path`, `process` (`argv`, `exitCode`, `stdout`, `stderr`).
- **Como uma CLI "vira comando":** campo `bin` do `package.json`, shebang, `npm link`.
- **Design de CLI:** o guia clig.dev (principalmente: básico, ajuda, saída, erros, argumentos e flags).

### O que vou precisar
Node LTS (22+), npm, git, editor com TypeScript; pacotes `typescript`, `tsx`, `commander`, `fast-glob`, `vitest`. (A versão atual do commander exige Node 22.12 ou superior.)

### Boas práticas
- `--help` com **exemplos** no topo e `--version` lida do `package.json`.
- Saída principal em `stdout`, mensagens/erros em `stderr`; exit code `0` no sucesso e não-zero na falha (isso é o que o CI usa).
- Prefira **flags** a argumentos posicionais quando houver mais de um dado; nomes de flag completos (`--fix`, `--dry-run`, `--json`).
- Use `path` do Node, nunca monte caminhos concatenando `/` (Windows existe).
- Declare `engines` e `files` no `package.json` (publica só o `dist`).
- Respeite `NO_COLOR` se for usar cores; não anime spinners quando a saída não for um terminal.

### O que NÃO fazer
- Não coloque lógica de análise dentro do arquivo `cli.ts`.
- Não espalhe `process.exit()` pelo código; centralize no ponto de entrada.
- Não percorra pastas com `fs` recursivo "na mão" sem ignorar `node_modules`.
- Não misture CommonJS e ESM sem entender a diferença.
- Não use `console.log` para erros.

### Links
- ✅ clig.dev (Command Line Interface Guidelines): https://clig.dev
- ✅ commander.js: https://github.com/tj/commander.js
- fast-glob: https://github.com/mrmlnc/fast-glob
- MDN, JavaScript Guide: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide
- TypeScript Handbook: https://www.typescriptlang.org/docs/handbook/intro.html
- Node.js, ESM: https://nodejs.org/api/esm.html
- Node.js, `process`: https://nodejs.org/api/process.html
- npm, campo `bin` do package.json: https://docs.npmjs.com/cli/configuring-npm/package-json#bin
- npm link: https://docs.npmjs.com/cli/commands/npm-link
- ✅ tsdown (bundler): https://tsdown.dev
- 12 Factor CLI Apps (citado no clig.dev): https://medium.com/@jdxcode/12-factor-cli-apps-dd3c227a0e46

### Exercício
CLI que recebe um diretório e imprime quantos arquivos de cada extensão existem, com `--help`, `--version` e erro amigável para diretório inexistente.

### Pronta quando
- [x] Instalo minha CLI com `npm link` e a rodo de qualquer pasta.
- [ ] Sei explicar a diferença entre ESM e CommonJS e por que escolhi um deles.
- [ ] Sei explicar o que o shebang e o campo `bin` fazem.
- [ ] Sei tipar uma função com union type e com generic, e usar um type guard.
- [ ] Sei explicar `stdout` vs `stderr` e para que serve o exit code.
- [x] A lógica de varredura está **fora** de `cli.ts` e tem ao menos um teste.

---

## Fase 1: AST e parsing (a teoria que sustenta o projeto)

**Objetivo:** entender o que é uma árvore sintática e por que o projeto precisa dela. Sem código de produção nesta fase.

### O que eu devo fazer
1. No **astexplorer.net**, cole CSS, SCSS, JSX e TSX e observe os nós gerados. Troque de parser (postcss, babel, typescript-estree) e compare.
2. Identifique **à mão** em qual nó está a cor `#ff0000` em `color: #ff0000` (CSS) e em `style={{ color: '#ff0000' }}` (JSX).
3. Leia os primeiros capítulos de *Crafting Interpreters* (código-fonte → tokens → árvore).
4. Escreva em um arquivo (suas palavras) o resumo: *código → tokens → AST → percorrer com visitor → apontar posição → editar*.

### O que eu vou estudar
- Código-fonte → tokens → AST; o que é percorrer a árvore (**padrão visitor**).
- **AST vs CST** e por que posições (`loc`, `start`, `end`, `offset`) importam para o autofix.
- Por que cada linguagem/parser produz árvores diferentes (CSS, JS/JSX, templates Angular).

### O que vou precisar
Navegador (astexplorer) e um caderno/arquivo de notas.

### Boas práticas
- Pense sempre em **"onde exatamente está o valor no arquivo?"**: é a pergunta que o autofix vai exigir.
- Anote diferenças entre parsers: por exemplo, linha/coluna começam em bases diferentes em ferramentas diferentes (confira na documentação de cada parser antes de reportar posições).

### O que NÃO fazer
- Não pule esta fase "porque dá para fazer com regex". Casos como comentários, strings, `calc()`, shorthands e valores dentro de funções quebram regex rapidamente.
- Não decore nomes de nós; entenda a estrutura.

### Links
- astexplorer: https://astexplorer.net
- Crafting Interpreters (grátis): https://craftinginterpreters.com
- Babel Plugin Handbook (seção sobre AST e visitors): https://github.com/jamiebuilds/babel-handbook/blob/master/translations/en/plugin-handbook.md
- ✅ PostCSS Architecture: https://postcss.org/docs/postcss-architecture

### Exercício
Anotar, para 5 trechos (2 de CSS, 1 de SCSS, 2 de JSX), o tipo do nó que contém o valor literal e o caminho da raiz até ele.

### Pronta quando
- [ ] Explico com minhas palavras por que **não** dá para fazer isso só com regex (com 2 exemplos que quebram).
- [ ] Explico o que é um visitor e o que "percorrer" a árvore significa.
- [ ] Sei dizer por que a posição do nó é indispensável para o autofix.
- [ ] Localizei corretamente o nó da cor nos dois exemplos (CSS e JSX).

---

## Fase 2: Parsing de CSS e SCSS (PostCSS)

**Objetivo:** listar todos os valores literais de cor, espaçamento e tipografia de arquivos `.css`/`.scss`, com arquivo, linha e coluna.

### O que eu devo fazer
1. Instalar `postcss`, `postcss-scss` e `postcss-value-parser`.
2. Ler um arquivo, parsear (com `postcss-scss` para `.scss`) e percorrer as declarações (`walkDecls`).
3. Para cada declaração, separar o **valor** em partes com `postcss-value-parser` (palavras, funções, strings, separadores).
4. Classificar a propriedade: cor (`color`, `background-color`, `border-color`...), espaçamento (`margin`, `padding`, `gap`...), tipografia (`font-size`, `line-height`, `font-family`...).
5. Reportar valores **literais**; ignorar os que já usam `var(--x)` (e, no SCSS, variáveis `$x`, se decidir tratá-las como "já tokenizadas").
6. Tratar *shorthands* (`margin: 4px 8px`) e valores compostos (`border: 1px solid #ccc`), reportando **cada parte** com sua posição.
7. Guardar o **offset** de cada achado (necessário na Fase 7).

### O que eu vou estudar
- Estrutura do PostCSS: `Root`, `Rule`, `Declaration`, `AtRule`, `Comment`; `walkDecls`, `walkRules`, `walkAtRules`.
- `postcss-scss`: variáveis `$x`, `@include`, `@mixin`, interpolação `#{}`, comentários `//`.
- CSS custom properties (`--x`, `var(--x, fallback)`), `calc()`, unidades (`px`, `rem`, `em`, `%`).
- `postcss-value-parser` (tipos de nó: palavra, função, string, espaço, divisor).
- Onde o PostCSS informa posição (`source.start`/`source.end`).

### O que vou precisar
`postcss`, `postcss-scss`, `postcss-value-parser`; uma pasta `fixtures/css` com 10 a 15 arquivos de exemplo (valores literais, `var()`, shorthands, comentários, SCSS com variáveis).

### Boas práticas
- Defina uma **lista de propriedades relevantes** por categoria (arquivo de configuração/constante) em vez de `if` espalhado.
- Trate **valores dentro de funções** (`rgba(0,0,0,.5)`, `linear-gradient(...)`): decida e documente se são analisados.
- Valores como `0`, `auto`, `inherit`, `transparent`, `currentColor` normalmente **não** são violações; mantenha uma lista de exceções.
- Decida desde já o que fazer com `!important` e com comentários de desativação (ex.: `/* ignore-token */`).
- Escreva testes de fixtures **desde esta fase** (veja a Fase 8).

### O que NÃO fazer
- Não use regex para separar `margin: 4px 8px 0 auto`.
- Não assuma que todo `.scss` é CSS válido; use o parser de SCSS.
- Não ignore silenciosamente arquivos que falharam no parse.
- Não misture a lógica de "o que é violação" com a de "como percorrer o arquivo".

### Links
- ✅ PostCSS docs: https://postcss.org/docs/
- ✅ PostCSS API: https://postcss.org/api/
- ✅ Writing a PostCSS Plugin (para entender o ciclo de walk/visit): https://postcss.org/docs/writing-a-postcss-plugin
- postcss-scss: https://github.com/postcss/postcss-scss
- postcss-value-parser: https://github.com/TrySound/postcss-value-parser
- ✅ Referência de comportamento esperado (design-lint, regras e docs): https://github.com/bylapidist/design-lint

### Exercício
Script que lista todas as declarações com cor, espaçamento ou tamanho de fonte literais, com arquivo, linha e coluna.

### Pronta quando
- [ ] O script lida com shorthands e reporta cada parte com a posição correta.
- [ ] O script ignora valores que já usam `var(--...)` e valores da lista de exceções.
- [ ] Funciona em `.css` e `.scss` (incluindo variáveis `$x` e `//` comentários).
- [ ] Um arquivo com erro de sintaxe gera `parse-error` e **não** derruba a execução.
- [ ] Tenho fixtures e testes cobrindo ao menos 10 casos (incluindo os "não é violação").

---

## Fase 3: Parsing de JSX/TSX (React)

**Objetivo:** encontrar valores literais em estilos inline (`style={{ ... }}`) de componentes React, com posição exata.

### O que eu devo fazer
1. Escolher o parser: **`@babel/parser`** (+ `@babel/traverse`) ou **`@typescript-eslint/typescript-estree`**. Escolha um, justifique no seu diário e use-o em todo o projeto.
2. Parsear `.jsx` com o plugin `jsx` e `.tsx` com `jsx` + `typescript` (no Babel). Para `.ts` sem JSX, só `typescript`.
3. Percorrer a árvore até `JSXAttribute` de nome `style` e ler o `ObjectExpression`.
4. Para cada propriedade, ler a **chave** (camelCase, ex.: `backgroundColor`) e o **valor**: string literal, número, template literal sem expressões.
5. Reaproveitar a classificação da Fase 2 (mapeando camelCase → propriedade CSS).
6. Reportar posição exata do **valor** (não do atributo inteiro).
7. Arquivos `*.module.css` e `.css` importados por componentes continuam sendo cobertos pela Fase 2.

### O que eu vou estudar
- Nós relevantes: `JSXAttribute`, `JSXExpressionContainer`, `ObjectExpression`, `ObjectProperty`, `StringLiteral`, `NumericLiteral`, `TemplateLiteral`.
- No React, **números** em estilo inline (ex.: `padding: 8`) viram `px` na maioria das propriedades, mas propriedades sem unidade (`lineHeight`, `opacity`, `zIndex`, `flex`) **não**. Isso muda o que é "violação" e o que o autofix escreve.
- Como obter `loc`/`range` em cada parser (no typescript-estree, essas opções vêm **desativadas** por padrão e precisam ser ligadas).
- Diferença entre analisar só sintaxe e analisar com informação de tipos (você só precisa da sintaxe).

### O que vou precisar
`@babel/parser` e `@babel/traverse` (e `@babel/types`), **ou** `@typescript-eslint/typescript-estree`; uma pasta `fixtures/react` com componentes variados (valores literais, variáveis, props dinâmicas, condicionais).

### Boas práticas
- Escopo explícito: **só valores literais**. Expressões dinâmicas (`style={{ color: props.color }}`) ficam fora e isso deve estar documentado.
- Decida e documente o que acontece com `styled-components`/CSS-in-JS (sugestão: fora do escopo inicial) e Tailwind (fora do escopo).
- Reaproveite o **mesmo núcleo** de classificação/normalização da Fase 2; só muda a forma de extrair os valores.
- Teste com `.jsx`, `.tsx`, genéricos em TS e arquivos com JSX aninhado.

### O que NÃO fazer
- Não use o mesmo conjunto de plugins para tudo (um `<T>` em `.ts` conflita com JSX).
- Não trate `padding: 8` como string `"8"`; entenda a semântica do React.
- Não relate a posição do atributo `style` no lugar da posição do valor.
- Não duplique a lógica de classificação por parser.

### Links
- ✅ @babel/parser: https://babeljs.io/docs/babel-parser
- @babel/traverse: https://babeljs.io/docs/babel-traverse
- ✅ @typescript-eslint/typescript-estree: https://typescript-eslint.io/packages/typescript-estree/
- ✅ ESLint plugin simples de referência (regra "não use hex"): https://github.com/MetaMask/design-tokens
- React, estilo inline: https://react.dev/reference/react-dom/components/common#applying-css-styles

### Exercício
Encontrar valores literais dentro de `style={{ ... }}` em um componente e imprimir o mesmo relatório da Fase 2, com a posição exata do valor.

### Pronta quando
- [ ] Acho violações em TSX/JSX com linha/coluna exatas (verifico abrindo o arquivo na posição).
- [ ] Trato corretamente números vs strings e propriedades sem unidade.
- [ ] Ignoro (e documento) estilos dinâmicos e valores de exceção.
- [ ] Reaproveito o mesmo núcleo de classificação da Fase 2.
- [ ] Tenho fixtures e testes cobrindo `.jsx` e `.tsx`.

---

## Fase 4: Angular

**Objetivo:** analisar estilos e templates de componentes Angular e passar o CSS extraído para a mesma lógica da Fase 2.

### O que eu devo fazer
1. Parsear arquivos `.ts` e localizar classes com o decorator `@Component`.
2. Ler as propriedades do decorator: `styles`, `styleUrl`/`styleUrls`, `template`, `templateUrl`.
3. **Estilos:** para `styles` inline, extrair o texto e rodar a Fase 2 (somando o deslocamento para manter a posição correta no `.ts`); para `styleUrls`, resolver os caminhos e analisar os `.css`/`.scss`.
4. **Templates:** para `template` inline e arquivos `.html`, parsear o template e achar atributos `style="..."`, bindings `[style.color]` e `[ngStyle]`.
5. Para o MVP, comece por: estilos (`styles`/`styleUrls`) e atributos `style="..."` estáticos. Bindings dinâmicos ficam para depois.

### O que eu vou estudar
- Anatomia do `@Component` (standalone vs módulos não importa para a análise, mas o decorator sim).
- Sintaxe de templates Angular: binding de propriedade/estilo, `ngStyle`, interpolação.
- Como parsear templates: **`parseTemplate`** do `@angular/compiler` (usado também pelo angular-eslint) ou o **`@angular-eslint/template-parser`**.
- Encapsulamento de estilos do Angular (`:host`, `::ng-deep`) para não gerar falsos positivos.

### O que vou precisar
`@angular/compiler` e/ou `@angular-eslint/template-parser`; o parser de TS escolhido na Fase 3 para ler o decorator; um projeto Angular pequeno em `fixtures/angular`.

### Boas práticas
- Cuidado com a **estabilidade da API**: o compilador do Angular não é pensado como API pública estável. **Fixe a versão**, isole o uso dele em um único módulo e cubra com testes.
- Calcule o **deslocamento** (offset) de template/estilo inline em relação ao arquivo `.ts` para reportar posições corretas.
- Deixe o Angular por último nos testes: é onde há mais variação de formato.
- Estudar como o angular-eslint organiza seu parser de templates ajuda a evitar reinventar a roda.

### O que NÃO fazer
- Não tente analisar templates Angular com um parser de HTML genérico e regex.
- Não dependa de detalhes internos do compilador espalhados pelo código.
- Não esqueça de testar com versões diferentes de Angular se pretende suportar mais de uma.

### Links
- ✅ angular-eslint (repositório): https://github.com/angular-eslint/angular-eslint
- ✅ @angular-eslint/template-parser (npm): https://www.npmjs.com/package/@angular-eslint/template-parser
- Documentação de componentes e estilos: https://angular.dev/guide/components/styling
- Documentação de templates: https://angular.dev/guide/templates

### Exercício
Extrair o CSS de um `@Component` (inline e via `styleUrls`) e passá-lo para a lógica da Fase 2, reportando posições corretas no arquivo original.

### Pronta quando
- [ ] Extraio estilos inline e externos de um componente real.
- [ ] Reporto a posição correta mesmo quando o estilo está dentro do `.ts`.
- [ ] Acho `style="..."` estático em templates `.html`.
- [ ] Tenho a dependência do compilador do Angular isolada em um único módulo.
- [ ] Tenho fixtures de ao menos 3 componentes Angular e testes para eles.

---

## Fase 5: Design tokens como dado

**Objetivo:** ler um arquivo de tokens, validá-lo e montar um índice valor → token para comparar com o código.

### O que eu devo fazer
1. Definir o seu **modelo interno** de token: caminho/nome, tipo, valor (já normalizado) e descrição opcional.
2. Escolher o formato de entrada. Sugestão para manter a ferramenta simples: um **subconjunto do formato W3C DTCG** (JSON com `$value`, `$type`, grupos e aliases).
3. Ler e **validar** o JSON (mensagens de erro claras apontando o caminho do token inválido).
4. **Resolver aliases** (um token que referencia outro) e detectar ciclos.
5. Montar o índice **valor normalizado → lista de tokens** (pode haver mais de um token com o mesmo valor).
6. Definir a **tabela de mapeamento** propriedade CSS → tipo de token (ex.: `color`/`background-color` → cor; `margin`/`padding`/`gap` → espaçamento; `font-size` → tamanho de fonte).
7. Suportar também tokens já expostos como CSS custom properties (`--color-primary`), para saber quando o código já está tokenizado.

### O que eu vou estudar
- O que são design tokens e seus níveis (primitivos, semânticos, de componente).
- O formato DTCG: `$value`, `$type`, `$description`, grupos, aliases. A versão **2025.10** é a primeira estável; confira como a especificação descreve o tipo de cor.
- Como projetos reais expõem tokens: JSON, variáveis CSS, variáveis SCSS.
- Style Dictionary (para entender como o ecossistema transforma tokens, sem precisar usá-lo).
- Como a ferramenta de referência (design-lint) modela tokens e regras (ela usa o formato **DTIF**, próprio, e não o DTCG; decida conscientemente qual você aceita).

### O que vou precisar
Um arquivo de tokens escrito por você (JSON) para um projeto pequeno; um validador simples (pode ser escrito à mão ou com uma biblioteca de schema).

### Boas práticas
- Valide cedo e diga **qual token** está errado, não só "JSON inválido".
- Normalize no momento da leitura (uma única vez), não a cada comparação.
- Deixe o formato de entrada **documentado** com um exemplo no README.
- Mantenha a lista de tipos suportados pequena no início (cor, espaçamento, tamanho de fonte).

### O que NÃO fazer
- Não invente um formato próprio sem necessidade; use o padrão aberto como base.
- Não deixe aliases sem resolver ou ciclos passarem sem erro.
- Não suponha que "um valor = um token": prepare o índice para múltiplos candidatos.
- Não misture a lógica do arquivo de tokens com a do parser de CSS/JSX.

### Links
- ✅ Especificação DTCG 2025.10 (estável): https://www.designtokens.org/TR/2025.10/
- ✅ Design Tokens Community Group (W3C): https://www.w3.org/community/design-tokens/
- ✅ Repositório do DTCG: https://github.com/design-tokens/community-group
- Style Dictionary: https://styledictionary.com
- ✅ design-lint: configuração, regras e arquitetura: https://github.com/bylapidist/design-lint (pasta `docs/`)

### Exercício
Escrever à mão um arquivo de tokens para um projeto pequeno e carregá-lo em TS com validação de formato, resolvendo aliases.

### Pronta quando
- [ ] Carrego um arquivo de tokens válido e rejeito um inválido com mensagem clara.
- [ ] Resolvo aliases e detecto ciclos.
- [ ] Construo um índice valor → token e lido com valores repetidos.
- [ ] Tenho a tabela propriedade CSS → tipo de token documentada.
- [ ] Sei explicar a diferença entre token primitivo e semântico.

---

## Fase 6: Normalização e "valor mais próximo"

**Objetivo:** comparar valores do código com os tokens de forma correta e sugerir o token mais próximo quando não houver correspondência exata.

### O que eu devo fazer
1. **Normalizar cores:** `#fff`, `#FFFFFF`, `rgb(255,255,255)`, `hsl(...)` e nomes (`white`) devem virar a mesma representação interna. Use a biblioteca **culori**.
2. **Normalizar dimensões:** `px` e `rem` (com raiz configurável, normalmente 16px), tratando `0` e unidades que não podem ser convertidas (`%`, `em`).
3. **Correspondência exata:** valor normalizado igual ao do token → violação com token sugerido (candidato ao autofix).
4. **Correspondência aproximada:** achar o token **mais próximo** com uma métrica adequada:
   - cores: distância perceptual (ΔE em um espaço como Lab/OKLab), não distância simples em RGB;
   - espaçamento/tipografia: diferença numérica com tolerância configurável.
5. Atribuir um **nível de confiança** (exato, aproximado dentro da tolerância, sem sugestão) e registrar o motivo da escolha.
6. Definir **desempate** (dois tokens a igual distância) de forma determinística e documentada.

### O que eu vou estudar
- Espaços de cor (sRGB, HSL, Lab, OKLab) e por que a distância em RGB não corresponde à percepção.
- Diferença de cor (ΔE) e funções de distância disponíveis no culori.
- Unidades CSS relativas e absolutas, e quando a conversão `px` ↔ `rem` é segura.
- Escolha de **tolerância** e como justificá-la (isso rende texto para o TCC).

### O que vou precisar
`culori`; um conjunto de pares "valor do código → token esperado" para testar a lógica (tabela de casos, incluindo casos de empate e de "sem token próximo").

### Boas práticas
- Isole a normalização em funções **puras** (entrada → saída), fáceis de testar com tabelas.
- Torne a tolerância **configurável** (flag ou arquivo de configuração) com um padrão sensato e documentado.
- Registre na saída **por que** o token foi sugerido (ex.: "distância 1,8 do token X").
- Pense na transparência (alpha): `rgba(0,0,0,.5)` não é o mesmo que `#000`.

### O que NÃO fazer
- Não compare cores como strings.
- Não use distância euclidiana em RGB como se fosse perceptual sem saber a limitação.
- Não autocorrija valores **aproximados** por padrão.
- Não converta unidades "no olho" (ex.: assumir `1rem = 16px` sem tornar configurável).

### Links
- ✅ culori: https://culorijs.org (veja *API reference* e *Color spaces*)
- ✅ culori, API: https://culorijs.org/api/
- ✅ culori, espaços de cor: https://culorijs.org/color-spaces/
- Diferença de cor (conceito): https://en.wikipedia.org/wiki/Color_difference
- CSS Color Level 4: https://drafts.csswg.org/css-color/

### Exercício
Dado `#0a3d91`, achar o token de cor mais próximo de uma lista e **explicar por que ele ganhou** (distância, métrica, desempate).

### Pronta quando
- [ ] Todos os formatos de cor equivalentes normalizam para o mesmo valor.
- [ ] Sei justificar a métrica de distância e a tolerância escolhidas.
- [ ] Tenho testes em tabela para exato, aproximado, empate e "sem sugestão".
- [ ] A saída explica o motivo da sugestão.
- [ ] A tolerância é configurável e documentada.

---

## Fase 7: Autofix e modo `--dry-run`

**Objetivo:** corrigir automaticamente valores literais por tokens, preservando a formatação do restante do arquivo.

### O que eu devo fazer
1. Definir a **estratégia de saída** por tipo de arquivo (ex.: CSS → `var(--color-primary)`; SCSS → variável ou `var()`; JSX → string com `var(--...)`). Documente a decisão.
2. Aplicar as correções **por posição**: a biblioteca `magic-string` edita o texto original usando os índices do arquivo original, sem reformatar. (No CSS puro, a própria mutação do PostCSS também é uma opção.)
3. Aplicar **todas** as edições de um arquivo de uma vez, evitando sobreposição (duas edições no mesmo trecho geram erro).
4. Implementar `--dry-run`: mostra o que **seria** alterado (diff ou lista) sem escrever nada.
5. Implementar `--fix`: grava os arquivos e informa claramente **quais arquivos** foram alterados e quantas correções.
6. Garantir **idempotência**: rodar `--fix` duas vezes não altera nada na segunda.
7. Avisar quando houver alterações não commitadas no git antes de reescrever arquivos (ou exigir `--force`).

### O que eu vou estudar
- Edição por posição vs reimpressão da AST (e por que a primeira preserva a formatação).
- Quebras de linha (CRLF vs LF), BOM e codificação de arquivos.
- Como ferramentas como ESLint/Stylelint modelam *fixes* (lista de edições por intervalo).
- Como gerar um diff legível no terminal.

### O que vou precisar
`magic-string` (ESM) e uma biblioteca de diff (opcional); fixtures de **entrada e saída esperada** para cada tipo de arquivo.

### Boas práticas
- Corrija apenas o que for **exato** por padrão; correções aproximadas só com opção explícita (ex.: `--fix-approximate`).
- Escreva o arquivo de forma segura (arquivo temporário e renomear), para não corromper em caso de falha.
- Relate **tudo o que mudou**: quando o programa altera estado (aqui, arquivos), o clig.dev recomenda dizer isso ao usuário.
- Mantenha o teste de idempotência como teste obrigatório.

### O que NÃO fazer
- Não reescreva o arquivo inteiro a partir da AST.
- Não altere nada sem `--fix`.
- Não aplique edições com índices calculados sobre o texto **já modificado** (use os índices do original).
- Não ignore CRLF/LF: você pode transformar um arquivo inteiro em diff.

### Links
- ✅ magic-string: https://github.com/Rich-Harris/magic-string
- ✅ clig.dev, seção sobre perigo/confirmação e `--dry-run`: https://clig.dev
- ✅ design-lint, uso e opções de `--fix`: https://github.com/bylapidist/design-lint/blob/main/docs/usage.md
- ESLint, como funcionam as correções (fixes): https://eslint.org/docs/latest/extend/custom-rules#applying-fixes

### Exercício
Autofix que troca `#ff0000` por `var(--color-danger)` em um CSS, com `--dry-run` e teste de idempotência.

### Pronta quando
- [ ] A correção preserva a formatação do restante do arquivo.
- [ ] `--dry-run` não escreve nada e mostra exatamente o que mudaria.
- [ ] Rodar `--fix` duas vezes não muda nada na segunda vez (teste automatizado).
- [ ] Funciona em CSS, SCSS e TSX com fixtures de entrada/saída esperada.
- [ ] A saída informa quais arquivos mudaram e quantas correções foram feitas.

---

## Fase 8: Testes e qualidade (formalizar o que já começou)

**Objetivo:** ter uma suíte de testes que dê confiança para evoluir a ferramenta. Comece a escrever testes na **Fase 2**; esta fase organiza e completa.

### O que eu devo fazer
1. Estruturar `tests/` e `fixtures/` por tipo (css, scss, react, angular, tokens).
2. **Testes unitários** para funções puras (normalização, distância, classificação).
3. **Testes de fixtures:** entrada → saída esperada (relatório e arquivos corrigidos).
4. **Snapshots** para relatórios e arquivos corrigidos; revise cada mudança de snapshot como se fosse código.
5. **Testes de CLI de ponta a ponta:** executar a CLI de verdade e verificar `stdout`, `stderr` e exit code.
6. **Teste de idempotência** do autofix e teste de **resiliência** (arquivo inválido não derruba a execução).
7. Rodar testes em CI (ex.: GitHub Actions) a cada push.
8. Fazer **smoke tests** manuais em 2 ou 3 projetos open source reais (útil também para a pesquisa).

### O que eu vou estudar
- Vitest: escrita de testes, matchers, snapshots (inline e em arquivo), testes assíncronos.
- Diferença entre teste unitário, de integração e de ponta a ponta.
- O que é regressão e como um teste por bug evita que o erro volte.

### O que vou precisar
`vitest`; fixtures bem nomeadas; um workflow de CI.

### Boas práticas
- Um caso de fixture por situação ("shorthand", "var já usado", "SCSS com interpolação").
- Em CI, o Vitest **não grava** snapshots novos e falha em divergências; isso é o comportamento desejado.
- Para saídas longas, prefira **snapshot em arquivo** (`toMatchFileSnapshot`), mais legível.
- Cubra os casos **negativos** (o que *não* é violação) com o mesmo rigor dos positivos.

### O que NÃO fazer
- Não atualize snapshots (`-u`) sem ler o diff.
- Não teste apenas o "caminho feliz".
- Não dependa de arquivos fora do repositório nos testes.
- Não acople testes a mensagens de texto frágeis quando um código/identificador serve.

### Links
- ✅ Vitest, snapshots: https://vitest.dev/guide/snapshot
- ✅ Vitest, tutorial de snapshots: https://vitest.dev/guide/learn/snapshots
- ✅ Vitest, escrevendo testes: https://vitest.dev/guide/learn/writing-tests
- ✅ Vitest, testes na prática: https://vitest.dev/guide/learn/testing-in-practice

### Exercício
Montar a pasta de fixtures com ao menos 3 casos por tipo de arquivo e um teste de CLI que verifica o exit code.

### Pronta quando
- [ ] `npm test` roda tudo e passa localmente e no CI.
- [ ] Há testes para casos positivos **e** negativos.
- [ ] O autofix tem teste de idempotência.
- [ ] Existe ao menos um teste de CLI de ponta a ponta (stdout/stderr/exit code).
- [ ] Rodei a ferramenta em ao menos 2 projetos reais e anotei o que quebrou.

---

## Fase 9: Geração de tokens quando não existe arquivo (a parte mais difícil)

**Objetivo:** analisar um projeto sem arquivo de tokens, agrupar os valores recorrentes e gerar um arquivo de tokens com **nomes semânticos** baseados em uma taxonomia.

### O que eu devo fazer
1. **Coletar** todos os valores literais do projeto (reaproveitando as Fases 2 a 4) e **normalizá-los** (Fase 6).
2. **Contar frequência** por valor e por tipo (cor, espaçamento, fonte).
3. **Agrupar valores muito próximos** (ex.: cores quase idênticas; espaçamentos 15px/16px) usando a distância e as tolerâncias da Fase 6; escolher um representante por grupo.
4. Construir a **taxonomia** de nomes com o método de Nickerson et al. (2013): definir a *meta-característica*, as *condições de término*, e iterar com abordagens empírico-para-conceitual (olhando os valores) e conceitual-para-empírico (partindo de conceitos de design).
5. **Nomear** os tokens com base na taxonomia (ex.: papel/função, não aparência).
6. Escrever o arquivo de tokens no formato escolhido na Fase 5, com `--dry-run` por padrão e confirmação/flag para gravar.
7. Opcionalmente, após gerar, rodar o autofix para trocar os valores literais pelos tokens criados.

### O que eu vou estudar
- O método de desenvolvimento de taxonomias de Nickerson, Varshney e Muntermann (2013) e a atualização metodológica de Kundisch et al. (2021).
- Convenções de nomenclatura de tokens (nome semântico vs nome por valor).
- Algoritmos simples de agrupamento (por limiar de distância; não precisa de aprendizado de máquina).
- Escalas de espaçamento e tipografia (4px/8px base, escalas modulares).

### O que vou precisar
Todas as fases anteriores funcionando; um conjunto de 2 ou 3 projetos sem tokens para validar a geração; o artigo de Nickerson et al. (2013) lido e fichado.

### Boas práticas
- A geração é uma **proposta**: sempre revisável por humano, e nunca sobrescreve um arquivo de tokens existente sem confirmação.
- Registre a **frequência** e os **locais de uso** de cada token gerado (ajuda a revisar).
- Torne os limiares de agrupamento configuráveis e documente o raciocínio.
- Gere saída **determinística** (mesma entrada, mesmo arquivo), para facilitar testes e diffs.

### O que NÃO fazer
- Não nomeie tokens como `color-1`, `color-2` sem significado.
- Não sobrescreva um arquivo de tokens existente.
- Não gere centenas de tokens "para cobrir tudo": priorize os recorrentes.
- Não aplique o método de Nickerson de forma superficial; ele é a base metodológica e pode ser descrito no TCC.

### Links
- ✅ Nickerson, Varshney, Muntermann (2013), DOI: https://doi.org/10.1057/ejis.2012.26
- ✅ Versão de acesso aberto (pós-print): https://opus.bibliothek.uni-augsburg.de/opus4/frontdoor/index/index/docId/93439
- ✅ Kundisch et al. (2021), *An Update for Taxonomy Designers*, Business & Information Systems Engineering (busque pelo título)
- ✅ DTCG 2025.10 (formato de saída): https://www.designtokens.org/TR/2025.10/

### Exercício
Rodar a geração em um projeto sem tokens, revisar à mão o arquivo gerado e anotar 3 decisões de agrupamento/nomenclatura com justificativa.

### Pronta quando
- [ ] A ferramenta gera um arquivo de tokens plausível para um projeto sem tokens.
- [ ] Os nomes seguem uma taxonomia que eu consigo explicar com o método de Nickerson.
- [ ] A saída é determinística e não sobrescreve arquivos existentes.
- [ ] Os limiares de agrupamento são configuráveis e documentados.
- [ ] Consigo descrever a geração em um parágrafo de metodologia para o TCC.

---

## Fase 10: Polimento, documentação e publicação

**Objetivo:** transformar o protótipo em uma ferramenta que outra pessoa consegue instalar, usar e confiar.

### O que eu devo fazer
1. **Configuração:** arquivo de configuração versionável no projeto (caminho dos tokens, extensões, tolerâncias, ignorados). Precedência: flags > variáveis de ambiente > arquivo do projeto.
2. **Saídas:** `--json` (para integração/CI), saída humana legível e `--quiet`.
3. **Códigos de saída:** definir e documentar (ex.: 0 sem violações, 1 com violações, 2 erro de uso/execução).
4. **README** com instalação, exemplos reais, formato dos tokens, lista de regras e limitações.
5. **Versionamento** semântico, `CHANGELOG` e publicação no npm (ou uso via `npx`).
6. Mensagens de erro que dizem **o que fazer** em seguida.
7. Documentar o que está **fora do escopo** (Tailwind, CSS-in-JS, estilos dinâmicos).

### O que eu vou estudar
- Versionamento semântico e compatibilidade (interfaces da CLI são contratos).
- Estrutura de documentação de CLIs (ajuda no terminal, README, exemplos).
- Publicação de pacotes no npm (`files`, `exports`/`bin`, `engines`).

### O que vou precisar
Conta no npm (se for publicar), workflow de release e uma pessoa de fora para testar a instalação.

### Boas práticas
- Faça alguém de fora seguir o README do zero e anote onde travou.
- Mudanças que quebram a interface devem ser **avisadas** antes (deprecação) e versionadas.
- Seja explícito sobre limitações; é mais honesto e útil para quem usa e para a pesquisa.

### O que NÃO fazer
- Não colete telemetria sem consentimento explícito.
- Não mude nome de flags/saída `--json` sem versionar.
- Não publique sem testar a instalação em uma máquina limpa.

### Links
- ✅ clig.dev (configuração, nomes, distribuição, futuro): https://clig.dev
- ✅ no-color.org: https://no-color.org
- Semantic Versioning: https://semver.org
- Keep a Changelog: https://keepachangelog.com

### Pronta quando
- [ ] Alguém de fora instala e roda a ferramenta só com o README.
- [ ] `--json` tem formato estável e documentado.
- [ ] Os exit codes estão definidos e documentados.
- [ ] Limitações e escopo estão claros no README.
- [ ] Existe uma versão publicada (ou instalável via `npx`) com `CHANGELOG`.

---

## Referências para estudar em paralelo

| Para quê | Referência |
|---|---|
| Ver como uma ferramenta real organiza regras, parsers e autofix | ✅ design-lint: https://github.com/bylapidist/design-lint (leia `docs/architecture.md`, `docs/rules/index.md`, `docs/usage.md`) |
| Ver uma regra simples (proibir hex) como plugin de ESLint | ✅ MetaMask design-tokens: https://github.com/MetaMask/design-tokens |
| Ver como templates Angular são parseados em um linter | ✅ angular-eslint: https://github.com/angular-eslint/angular-eslint |
| Boas práticas de CLI | ✅ https://clig.dev |
| Formato de tokens | ✅ https://www.designtokens.org/TR/2025.10/ |

---

## Modelo de registro por fase (copie e preencha)

```markdown
## Registro da Fase N: <título>
- Data início / fim:
- O que eu consegui fazer:
- O que eu errei e como corrigi:
- O que ainda não entendi bem:
- Decisões tomadas (e por quê):
- Link do commit/pasta do exercício:
- Post de LinkedIn (rascunho em 3 linhas):
```

---

## Checklist final do projeto

- [ ] CLI instalável e documentada (Fase 0 e 10)
- [ ] Análise de CSS/SCSS, React e Angular (Fases 2 a 4)
- [ ] Leitura e validação de tokens (Fase 5)
- [ ] Sugestão de token exato e aproximado, com justificativa (Fase 6)
- [ ] Autofix seguro, idempotente e com `--dry-run` (Fase 7)
- [ ] Testes, fixtures e CI (Fase 8)
- [ ] Geração de tokens com taxonomia de Nickerson (Fase 9)
- [ ] README, `--json` e versão publicada (Fase 10)