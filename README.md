# 🧹 TokenTidy

Ferramenta de linha de comando desenvolvida como meu **Trabalho de Conclusão de Curso (TCC)** para ajudar a manter o código de front-end **fiel ao design system**. A ideia é encontrar valores visuais "soltos" no código (como `#4f46e5`, `17px` ou `font-family: Arial`), indicar qual **design token** deveria ser usado no lugar, corrigir o código com segurança e, quando o projeto ainda não tem tokens, ajudar a criá-los.

> ⚠️ Projeto em desenvolvimento (versão `0.x`). Hoje a CLI já varre o projeto e identifica os arquivos que serão analisados; a detecção de valores soltos vem nas próximas etapas. Veja o [roadmap](#️-roadmap).

---

## Sumário

- [O problema](#-o-problema)
- [O que são design tokens](#-o-que-são-design-tokens)
- [A proposta](#-a-proposta)
- [Escopo](#-escopo)
- [Instalação e uso](#-instalação-e-uso)
- [Como deve funcionar](#️-como-deve-funcionar)
- [Trabalhos relacionados](#-trabalhos-relacionados)
- [Metodologia](#-metodologia)
- [Roadmap](#️-roadmap)
- [Estrutura do repositório](#-estrutura-do-repositório)
- [Desenvolvimento](#️-desenvolvimento)
- [Relação com o TCC](#-relação-com-o-tcc)
- [Licença](#-licença)

---

## ❓ O problema

Em quase todo projeto de front-end, o design começa organizado e vai se perdendo aos poucos:

- A mesma cor aparece escrita de cinco jeitos diferentes (`#4F46E5`, `#4f46e5`, `rgb(79, 70, 229)`…)
- Surgem espaçamentos "quase iguais", como `10px`, `11px` e `12px`, que deveriam ser um só
- Estilos ficam espalhados entre arquivos CSS, SCSS, estilos inline e componentes
- Quando o design muda (ex.: a cor primária), é preciso caçar e trocar o valor manualmente em vários arquivos

O resultado é uma interface **inconsistente** e um código **difícil de manter**. Os linters tradicionais (ESLint, Stylelint) verificam se o código está bem escrito, mas **não sabem se ele segue o design system**. E muitos projetos **nem chegaram a ter tokens**: criar um conjunto do zero a partir de um código existente é lento e manual.

---

## 🎨 O que são design tokens

**Design tokens** são as decisões visuais de um design system guardadas como dados nomeados: cores, espaçamentos, tipografia, bordas, sombras etc. Em vez de escrever o valor direto, o código referencia o token:

```css
/* ❌ Valor solto (hardcoded) */
.botao {
  background-color: #4f46e5;
  padding: 10px 12px;
  border-radius: 10px;
}

/* ✅ Usando design tokens */
.botao {
  background-color: var(--color-primary);
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-md);
}
```

Os tokens podem ser **primitivos** (`--color-indigo-600: #4f46e5`) ou **semânticos** (`--color-primary: var(--color-indigo-600)`), e são exportados em formatos que designers e desenvolvedores compartilham, como o [DTCG](https://www.designtokens.org/) (W3C Design Tokens Community Group).

Assim, mudar a cor primária significa alterar **um único lugar**.

---

## 💡 A proposta

O **TokenTidy** ataca dois problemas: **detectar e corrigir os desvios** onde já existe um padrão e **ajudar a criar o padrão** onde ele ainda não existe.

| Etapa | O que faz |
|---|---|
| 🔍 **Detectar** | Varre o projeto e encontra valores visuais soltos (cores, espaçamentos, tipografia), com arquivo, linha e coluna |
| 🎯 **Sugerir** | Compara cada valor com os tokens do projeto e indica o token exato ou o mais próximo, explicando a escolha |
| 🔁 **Corrigir** | Troca os valores pelos tokens editando só o trecho necessário, com simulação prévia (`--dry-run`) e, por padrão, apenas para valores exatos |
| 🏷️ **Gerar** | Quando o projeto não tem tokens, agrupa os valores repetidos e propõe um arquivo de tokens com nomes semânticos |
| 🛡️ **Verificar** | Saída previsível, `--json` e códigos de saída próprios para rodar no CI e em hooks de pre-commit |

Princípios: nada é alterado sem pedido explícito, cada sugestão vem com o motivo, a mesma entrada produz sempre o mesmo resultado e um arquivo com erro não interrompe a análise dos demais. A ferramenta não coleta dados de uso nem envia nada para fora do computador.

---

## 🧭 Escopo

| Analisa | Fora do escopo (por decisão) |
|---|---|
| CSS e SCSS | Tailwind e outras abordagens de classes utilitárias |
| Estilos inline do React (`style={{...}}` em JSX/TSX) | Bibliotecas de CSS-in-JS |
| Angular: estilos do componente, arquivos de estilo e templates | Estilos dinâmicos, calculados só em execução |
| HTML | Inteligência artificial e serviços externos |

Arquivos considerados hoje: `.css`, `.scss`, `.html`, `.js`, `.jsx`, `.ts` e `.tsx`. As pastas `node_modules`, `dist`, `build`, `.git` e `coverage` são ignoradas.

---

## 🚀 Instalação e uso

Requisito: **Node.js 22.17 ou superior**.

Como o pacote ainda não foi publicado no npm, instale direto do GitHub, como dependência de desenvolvimento do seu projeto:

```bash
npm install -D github:laiscoutinho/tokentidy
npx tokentidy --help
```

### Comandos disponíveis

```bash
tokentidy check ./src          # conta os arquivos analisáveis por extensão
tokentidy check ./src --json   # o mesmo resultado em JSON, para scripts e CI
tokentidy --version
```

A saída segue a filosofia UNIX: só o dado, uma linha por registro, campos separados por tab. Por isso combina com outras ferramentas do terminal:

```bash
tokentidy check ./src | grep -v "0$"   # só as extensões que têm arquivos
```

Erros vão para o `stderr` e o comando termina com código de saída diferente de zero. A lista completa de comandos (atuais e planejados) está em [docs/comandos.md](docs/comandos.md).

---

## ⚙️ Como deve funcionar

Fluxo previsto de uso:

```
  Código do projeto
        │
        ▼
 ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
 │  1. Ler o    │ ──▶ │ 2. Entender  │ ──▶ │ 3. Comparar  │
 │  projeto     │     │ o código(AST)│     │ com os tokens│
 └──────────────┘     └──────────────┘     └──────┬───────┘
                                                  │
                                           ┌──────▼───────┐
                                           │ 4. Reportar, │
                                           │ sugerir ou   │
                                           │ corrigir     │
                                           └──────────────┘
```

Cada arquivo é interpretado pela sua estrutura (árvore sintática), e não por busca de texto. Assim a ferramenta distingue uma cor de um texto que só parece uma e sabe a posição exata de cada valor, o que permite corrigir sem mexer no resto do arquivo.

Exemplo previsto de um achado no `--json`:

```json
{
  "file": "src/App.scss",
  "line": 10,
  "column": 21,
  "offset": 184,
  "kind": "color",
  "value": "#f9fafb"
}
```

---

## 📚 Trabalhos relacionados

Antes de construir o TokenTidy, ferramentas existentes foram estudadas e testadas na prática no [tcc-labs](https://github.com/laiscoutinho/tcc-labs). Cada uma resolve parte do problema:

| Ferramenta | Foco | Pontos fortes | Limitações observadas / documentadas |
|---|---|---|---|
| [**@lapidist/design-lint**](https://github.com/bylapidist/design-lint) | Linter de design system | Valida uso de tokens em JS, TS, CSS, SCSS e Less; formato de tokens DTIF; `--fix`; integração com CI, LSP e MCP | Precisa que os tokens já existam; não analisa expressões dinâmicas em estilo inline; `.sass` indentado gera `parse-error`; kernel em segundo plano exige cuidado ao trocar de projeto |
| [**Design Token Extractor & Migrator**](https://github.com/bobrowsse-tech/design-token-extractor) | Extração e migração de tokens | Varre CSS, SCSS, Less, Vue, HTML e JS/TS; agrupa valores parecidos; gera DTCG/Tokens Studio; migração com pré-visualização e desfazer | Foco em extensão do VS Code; a verificação contínua é mais simples (`check` contra o lockfile) |
| [**stylelint-declaration-strict-value**](https://github.com/AndyOGo/stylelint-declaration-strict-value) | Regra do Stylelint | Obriga o uso de variáveis em propriedades escolhidas | Só analisa folhas de estilo; não sabe quais tokens existem nem sugere substituições |

O TokenTidy se apoia nessas lições: combinar **verificação e correção** com a **geração de tokens** para quem ainda não tem um conjunto, sem processos em segundo plano, e tratar o **Angular** com o mesmo cuidado que o React.

---

## 🔬 Metodologia

1. **Revisão bibliográfica** sobre design systems, design tokens e padrões de formato (DTCG, DTIF)
2. **Experimentação** com ferramentas existentes no [tcc-labs](https://github.com/laiscoutinho/tcc-labs), seguindo o fluxo: escolher, configurar, rodar em cada projeto-base, registrar resultados (inclusive o que falhou) e concluir
3. **Levantamento de lacunas**: o que nenhuma ferramenta cobre bem (ex.: projetos sem tokens, CSS inline, Angular)
4. **Desenvolvimento** do TokenTidy com foco nessas lacunas
5. **Avaliação** do TokenTidy nos projetos-base, comparando com as ferramentas estudadas por critérios como:
   - Formas de estilização detectadas
   - Quantidade de valores soltos encontrados (e falsos positivos/negativos)
   - Qualidade das sugestões de tokens e das correções automáticas
   - Facilidade de instalação, configuração e uso

Os projetos-base são a mesma aplicação de lista de tarefas feita em HTML + JavaScript, React + Vite e Angular, com formas de estilização diferentes. Eles ficam no [tcc-labs](https://github.com/laiscoutinho/tcc-labs).

---

## 🗺️ Roadmap

**Legenda:** ⚪ Planejado · 🟡 Em andamento · 🟢 Concluído

| Etapa | Status |
|---|---|
| Estudo de ferramentas existentes (design-lint, Design Token Extractor) | 🟢 |
| Definição do escopo e da arquitetura | 🟢 |
| Esqueleto da CLI em TypeScript (`check`, `--json`, testes) | 🟡 |
| Detecção de valores soltos em CSS e SCSS | ⚪ |
| Detecção em estilos inline do React (JSX/TSX) | ⚪ |
| Detecção em componentes e templates Angular | ⚪ |
| Leitura de arquivo de tokens (DTCG) | ⚪ |
| Sugestão do token exato ou mais próximo | ⚪ |
| Correção automática (`--fix`, `--dry-run`) | ⚪ |
| Geração de tokens com nomes semânticos | ⚪ |
| Uso no CI (códigos de saída, configuração do projeto) e publicação no npm | ⚪ |
| Avaliação comparativa nos projetos-base | ⚪ |
| Escrita do texto do TCC | ⚪ |

---

## 📁 Estrutura do repositório

```
tokentidy/
├── src/
│   ├── cli.ts          # interface de linha de comando (argumentos, saída, exit code)
│   ├── index.ts        # API pública, para usar o TokenTidy como biblioteca
│   ├── types.ts        # tipos compartilhados (ex.: Finding, um valor solto encontrado)
│   ├── scanner.ts      # encontra os arquivos a analisar
│   ├── parsers/        # análise de CSS/SCSS, JSX/TSX e Angular
│   ├── tokens/         # leitura do arquivo de tokens
│   ├── suggest/        # normalização de valores e token mais próximo
│   ├── fix/            # correção automática
│   └── generate/       # geração de tokens
├── test/               # testes automatizados e projetos de exemplo (fixtures)
└── docs/               # guia de desenvolvimento, comandos e registros
```

A CLI (`cli.ts`) só cuida de entrada e saída; toda a análise fica em módulos separados, testáveis sem terminal.

---

## 🛠️ Desenvolvimento

Feito em **TypeScript** (ESM), com Node.js **22.18 ou superior** para desenvolver: o Node executa os arquivos `.ts` direto, sem etapa de build. O build só acontece para gerar o pacote (`dist/`, com JavaScript e tipos).

```bash
git clone https://github.com/laiscoutinho/tokentidy.git
cd tokentidy
npm install                    # instala as dependências e compila o dist/

npm run dev -- check ./src     # roda a CLI direto do código-fonte
npm run check                  # checagem de tipos + testes
npm run build                  # compila src/ para dist/
npm link                       # cria o comando global tokentidy (aponta para dist/)
```

Mais comandos e o passo a passo para testar a instalação como usuário estão em [docs/comandos.md](docs/comandos.md).

---

## 🔗 Relação com o TCC

- **Tema:** ferramenta para detecção, correção e geração de design tokens em projetos de front-end
- **Autoria:** Laís Coutinho
- **Curso / Instituição:** _preencher_
- **Orientador(a):** _preencher_
- **Laboratório de experimentos:** [tcc-labs](https://github.com/laiscoutinho/tcc-labs)

---

## 📄 Licença

_Defina a licença (ex.: MIT) ou indique que o conteúdo é de uso acadêmico._

---

<sub>Feito com curiosidade e muito café ☕</sub>
