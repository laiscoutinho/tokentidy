# 🧹 TokenTidy

> 🇺🇸 Para ler este arquivo em inglês, [clique aqui](../../README.md).

Uma ferramenta de linha de comando criada como meu **Trabalho de Conclusão de Curso (TCC)** para ajudar a manter o código front-end **fiel ao design system**. Ela encontra valores visuais fixos no código (como `#4f46e5`, `17px` ou `font-family: Arial`), aponta qual **design token** deveria ser usado no lugar, corrige o código com segurança e, quando o projeto ainda não tem tokens, ajuda a criá-los.

> ⚠️ Em desenvolvimento (versão `0.0.x`: cada recurso é uma versão patch; a `0.1.0` será a primeira com todos os recursos planejados). Hoje o TokenTidy encontra valores fixos em CSS, SCSS, Sass, Less, HTML, React (JSX/TSX) e Angular, gera design tokens a partir dos repetidos e troca valores fixos por tokens de exatamente o mesmo valor. Veja o [roadmap](#️-roadmap).

```bash
npm install -D github:laiscoutinho/tokentidy
npx tokentidy check
```

```
src/App.jsx:29:28	violation	color/hardcoded	color	#4f46e5
src/App.scss:8:8	violation	spacing/hardcoded	gap	10px
```

---

## 📖 Leitura recomendada

Novo na linha de comando ou em design tokens? Leia nesta ordem; cada página trata de um assunto.

| # | Página | O que você vai aprender |
|---|---|---|
| 1 | [Design tokens](design-tokens.md) | O que são tokens e por que valores fixos no código são um problema |
| 2 | [Noções de terminal](terminal-basics.md) | Como abrir um terminal e rodar um comando |
| 3 | [Instalação](installation.md) | Como instalar o TokenTidy no seu projeto |
| 4 | [Primeiros passos](quick-start.md) | Da primeira análise à primeira correção, passo a passo |
| 5 | [Comandos](commands.md) | Todos os comandos e as opções em comum |
| 6 | [check](check.md) | Encontrar valores fixos no código |
| 7 | [Regras](rules.md) | O que cada regra informa, e o que nunca é informado |
| 8 | [Comentários de ignore](ignore-comments.md) | Manter um valor intencional |
| 9 | [generate](generate.md) | Criar tokens a partir dos valores repetidos |
| 10 | [fix](fix.md) | Trocar valores por tokens |
| 11 | [Configuração](configuration.md) | O arquivo `tokentidy.config.json` |
| 12 | [Códigos de saída](exit-codes.md) | O que quer dizer o número no fim de cada comando |
| 13 | [Scripts e CI](ci-and-scripts.md) | Scripts do npm, GitHub Actions e verificação antes do commit |
| 14 | [Saída JSON](json-output.md) | Ler os resultados a partir de outro programa |
| 15 | [Como funciona](how-it-works.md) | As etapas dentro do TokenTidy e os princípios dele |

---

## ❓ O problema

Em quase todo projeto front-end, o design começa organizado e aos poucos se desvia:

- A mesma cor aparece escrita de cinco jeitos diferentes (`#4F46E5`, `#4f46e5`, `rgb(79, 70, 229)`…)
- Surgem espaçamentos "quase iguais", como `10px`, `11px` e `12px`, que deveriam ser um só
- Os estilos ficam espalhados entre CSS, SCSS, estilos inline e componentes
- Quando o design muda (por exemplo, a cor primária), o valor precisa ser caçado e trocado à mão em vários arquivos

O resultado é uma interface **inconsistente** e um código **difícil de manter**. Linters tradicionais (ESLint, Stylelint) verificam se o código está bem escrito, mas **não sabem se ele segue o design system**. E muitos projetos **nunca tiveram tokens**: montar um conjunto do zero a partir do código existente é lento e manual.

---

## 💡 A proposta

O **TokenTidy** ataca dois problemas: **detectar e corrigir desvios** onde já existe um padrão, e **ajudar a criar o padrão** onde ele ainda não existe.

| Etapa | O que faz |
|---|---|
| 🔍 **Detectar** | Varre o projeto e encontra valores visuais fixos (cores, espaçamentos, tamanhos, bordas arredondadas, tipografia, sombras, animação…), com arquivo, linha e coluna |
| 🎯 **Sugerir** | Compara cada valor com os tokens do projeto e aponta o token exato ou o mais próximo, explicando a escolha |
| 🔁 **Corrigir** | Troca valores por tokens editando só o trecho necessário, com prévia (`--dry-run`) e, por padrão, só para valores exatamente iguais |
| 🏷️ **Gerar** | Quando o projeto não tem tokens, agrupa os valores repetidos e propõe um arquivo de tokens com nomes conhecidos |
| 🛡️ **Verificar** | Saída previsível, `--json` e códigos de saída próprios para rodar no CI e em hooks de pre-commit |

O diferencial é o **contexto**: o TokenTidy olha o que um valor está fazendo (a propriedade, o seletor, as declarações ao lado) antes de decidir se ele deveria ser um token. Mais em [Como funciona](how-it-works.md).

---

## 🧭 Escopo

| Analisa | Fora do escopo (por decisão) |
|---|---|
| CSS, SCSS, Sass (indentado) e Less | Tailwind e outras abordagens de classes utilitárias |
| Estilos inline do React (`style={{...}}` em JSX/TSX) | Bibliotecas de CSS-in-JS |
| Angular: estilos de componentes, arquivos de estilo e templates (`[style.x]`, `[ngStyle]`) | Estilos dinâmicos calculados só em tempo de execução |
| HTML (`<style>` e `style=""`) | Inteligência artificial e serviços externos |
| Arquivos de design tokens no formato [DTCG](https://www.designtokens.org/) | |

---

## 🗺️ Roadmap

**Legenda:** ⚪ Planejado · 🟡 Em andamento · 🟢 Concluído

| Etapa | Status |
|---|---|
| Estudo das ferramentas existentes (design-lint, Design Token Extractor) | 🟢 |
| Definição de escopo e arquitetura | 🟢 |
| Esqueleto da CLI em TypeScript (`check`, `--json`, testes) | 🟢 |
| Detecção de valores fixos em CSS e SCSS | 🟢 |
| Detecção em Sass (indentado), Less e HTML | 🟢 |
| Detecção em estilos inline do React (JSX/TSX) | 🟢 |
| Detecção em componentes e templates Angular | 🟢 |
| Leitura de tokens existentes (DTCG, custom properties do CSS, variáveis SCSS/Less) | 🟢 |
| Geração de tokens (DTCG + CSS/SCSS/Less, nomes de escala, aliases semânticos) | 🟢 |
| Configuração do projeto (`tokentidy.config.json`) | 🟢 |
| Arquivos e pastas como entrada, detecção da raiz do projeto | 🟢 |
| Identificadores de regra, itens de *revisão*, custom properties locais, breakpoints | 🟢 |
| Comentários de ignore e pastas ignoradas | 🟢 |
| Diagnóstico de escala no `generate`, gravação segura | 🟢 |
| Correção automática de valores exatos (`fix`, `--dry-run`) | 🟢 |
| Detecção com contexto (container da página vs. tamanho de ícone) | 🟡 |
| Uso no CI e publicação no npm | 🟡 CI em Linux/Windows/macOS |
| Correção de valores próximos de um token (`fix --approximate`) | ⚪ |
| Sugerir o token exato ou o mais próximo (`check --tokens`) | ⚪ |
| Cores quase duplicadas e renomeação de tokens existentes | ⚪ |
| Objetos de estilo fora do `style={{}}` e CSS-in-JS | ⚪ |
| Mapear valores reserva do `var()` (ex.: `var(--space, 12px)`) | ⚪ |
| Unidades relativas (`%`, `vw`, `vh`): comparar com valores absolutos usados no mesmo papel | ⚪ |
| Avaliação comparativa nos projetos base | ⚪ |
| Escrita do texto do TCC | ⚪ |

O plano detalhado, versão por versão, está em [development/roadmap.md](../../development/roadmap.md) (em inglês).

---

## 📁 Estrutura do repositório

```
tokentidy/
├── src/
│   ├── cli.ts            # ponto de entrada (ativa o cache de compilação e carrega cli/program.ts)
│   ├── cli/              # o programa de linha de comando: um módulo por comando, saída, códigos de saída
│   ├── index.ts          # API pública, para usar o TokenTidy como biblioteca
│   ├── types.ts          # tipos compartilhados (ex.: Finding, um valor fixo encontrado)
│   ├── project/          # configuração, raiz do projeto e arquivos a analisar
│   ├── analysis/         # lê cada arquivo, aplica as regras e os comentários de ignore
│   ├── parsers/          # CSS/SCSS/Sass/Less (css/), HTML, JSX/TSX, Angular e DTCG
│   ├── values/           # normalização de valores e informações de cor
│   ├── token-index.ts    # tokens que o projeto já define, e onde cada sintaxe funciona
│   ├── generate/         # geração de tokens: agrupamento, nomes (naming/), arquivos de saída (output/)
│   ├── fix/              # correção automática: candidatos a token, plano, diff, aplicação segura
│   └── safe-write.ts     # gravação atômica dentro do projeto
├── test/                 # testes automatizados e projetos de exemplo (fixtures)
├── docs/                 # documentação de uso (inglês, com traduções em pt-br/)
└── development/          # documentação de desenvolvimento: setup, padrão de código, roadmap, registros
```

A CLI (`cli.ts` e `cli/`) só cuida de entrada e saída; toda a análise fica em módulos separados, que podem ser testados sem terminal.

---

## 🛠️ Desenvolvimento

Escrito em **TypeScript** (ESM), com Node.js **22.20 ou mais recente**, que roda os arquivos `.ts` direto.

```bash
git clone https://github.com/laiscoutinho/tokentidy.git
cd tokentidy
npm install        # instala as dependências e gera o dist/
npm run check      # checagem de tipos + testes
```

A documentação de desenvolvimento fica em inglês:

| Documento | Conteúdo |
|---|---|
| [Local setup](../../development/local-setup.md) | Comandos de desenvolvimento, testar a instalação como usuário, CI e releases |
| [Code standard](../../development/code-standard.md) | Comentários, tamanho de arquivo, nomes e pastas |
| [Roadmap](../../development/roadmap.md) | O plano da 0.0.10 até a 0.1.0 |
| [Development guide](../../development/development-guide.md) | As fases originais e as regras de ouro |
| [Research log](../../development/research-log.md) e [experience log](../../development/experience-log.md) | As fontes por trás de cada decisão, e as dificuldades encontradas |

---

## 🤝 Comunidade

O TokenTidy é meu **Trabalho de Conclusão de Curso (TCC)**, então por enquanto **não aceita contribuições externas** (pull requests). Issues relatando bugs ou ideias são bem-vindas.

Depois da apresentação do TCC, o projeto vai se abrir a contribuições como código aberto. Qualquer uso, cópia ou trabalho derivado deve sempre **citar este repositório** ([github.com/laiscoutinho/tokentidy](https://github.com/laiscoutinho/tokentidy)) **e a autoria, de Laís Coutinho**.

- **Tema:** uma ferramenta para detectar, corrigir e gerar design tokens em projetos front-end
- **Autoria:** Laís Coutinho
- **Curso / Instituição:** _a preencher_
- **Orientador(a):** _a preencher_
- **Laboratório de experimentos:** [tcc-labs](https://github.com/laiscoutinho/tcc-labs)

---

## 📄 Licença

[Apache License 2.0](../../LICENSE). Você pode usar, modificar e distribuir o TokenTidy, inclusive comercialmente, desde que mantenha a licença e o arquivo [NOTICE](../../NOTICE), que dá o crédito a Laís Coutinho e traz o link deste repositório.

---

<sub>Feito com curiosidade e muito café ☕</sub>
