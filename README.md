# 🧹 TokenTidy

Ferramenta desenvolvida como meu **Trabalho de Conclusão de Curso (TCC)** para ajudar a manter o código de front-end **fiel ao design system**. A ideia é encontrar valores visuais "soltos" no código (como `#4f46e5`, `17px` ou `font-family: Arial`), transformá-los em **design tokens** e garantir que o projeto continue usando esses tokens com o passar do tempo.

> ⚠️ Projeto em desenvolvimento. Este README descreve a proposta, o contexto e o plano do TCC. As funcionalidades serão marcadas como concluídas conforme forem implementadas.

---

## Sumário

- [O problema](#-o-problema)
- [O que são design tokens](#-o-que-são-design-tokens)
- [A proposta](#-a-proposta)
- [Como deve funcionar](#-como-deve-funcionar)
- [Stacks e formas de estilização](#-stacks-e-formas-de-estilização)
- [Trabalhos relacionados](#-trabalhos-relacionados)
- [Metodologia](#-metodologia)
- [Roadmap](#-roadmap)
- [Estrutura do repositório](#-estrutura-do-repositório)
- [Relação com o TCC](#-relação-com-o-tcc)
- [Licença](#-licença)

---

## ❓ O problema

Em quase todo projeto de front-end, o design começa organizado e vai se perdendo aos poucos:

- A mesma cor aparece escrita de cinco jeitos diferentes (`#4F46E5`, `#4f46e5`, `rgb(79, 70, 229)`…)
- Surgem espaçamentos "quase iguais", como `10px`, `11px` e `12px`, que deveriam ser um só
- Estilos ficam espalhados entre arquivos CSS, SCSS, estilos inline, classes do Tailwind e Bootstrap
- Quando o design muda (ex.: a cor primária), é preciso caçar e trocar o valor manualmente em vários arquivos

O resultado é uma interface **inconsistente** e um código **difícil de manter**. Os linters tradicionais (ESLint, Stylelint) verificam se o código está bem escrito, mas **não sabem se ele segue o design system**.

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

Os tokens podem ser **primitivos** (`--color-indigo-600: #4f46e5`) ou **semânticos** (`--color-primary: var(--color-indigo-600)`), e são exportados em formatos que designers e desenvolvedores compartilham, como o [DTCG](https://www.designtokens.org/) (W3C Design Tokens Community Group) e o do Tokens Studio para Figma.

Assim, mudar a cor primária significa alterar **um único lugar**.

---

## 💡 A proposta

O **TokenTidy** quer cobrir o ciclo completo de "arrumar" os tokens de um projeto:

| Etapa | O que faz |
|---|---|
| 🔍 **Detectar** | Varre o projeto e encontra valores visuais soltos (cores, espaçamentos, tipografia, raios de borda…) em diferentes linguagens e formas de estilização |
| 🧩 **Agrupar** | Junta valores iguais ou muito parecidos e sugere quais deveriam virar um único token |
| 🏷️ **Nomear e gerar** | Propõe nomes para os tokens e gera os arquivos (CSS custom properties, SCSS, JSON no formato DTCG) |
| 🔁 **Migrar** | Substitui os valores soltos pelas referências aos tokens, com pré-visualização para o usuário aceitar ou recusar cada mudança |
| 🛡️ **Verificar** | Funciona como um linter: aponta quando um novo valor solto é adicionado e pode ser usado no CI para impedir regressões |
| 📊 **Relatar** | Gera relatórios sobre a adoção de tokens no projeto (quantos valores soltos, onde estão, quais categorias) |

O diferencial buscado é **juntar extração e verificação na mesma ferramenta** e dar atenção especial às formas de estilização que as ferramentas atuais têm mais dificuldade de analisar, como **CSS inline** e **classes utilitárias** (Tailwind, Bootstrap).

---

## ⚙️ Como deve funcionar

Fluxo previsto de uso:

```
  Código do projeto
        │
        ▼
 ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
 │   1. Scan    │ ──▶ │  2. Agrupar  │ ──▶ │  3. Gerar    │
 │ valores soltos│     │ e nomear     │     │ tokens       │
 └──────────────┘     └──────────────┘     └──────┬───────┘
                                                  │
                      ┌──────────────┐     ┌──────▼───────┐
                      │ 5. Verificar │ ◀── │ 4. Migrar    │
                      │ (lint / CI)  │     │ (com preview)│
                      └──────────────┘     └──────────────┘
```

Exemplo de relatório de detecção (formato inspirado nos testes feitos no laboratório):

```json
{
  "file": "src/App.scss",
  "line": 10,
  "selector": ".tarefa",
  "property": "background-color",
  "rawValue": "#f9fafb",
  "category": "color"
}
```

> A interface final (CLI, extensão de editor ou ambas) e os comandos exatos serão definidos ao longo do desenvolvimento e documentados aqui.

---

## 🧱 Stacks e formas de estilização

Para avaliar a ferramenta, o TCC usa **a mesma aplicação de lista de tarefas** feita com tecnologias e formas de estilização diferentes. Como o comportamento é igual, dá para comparar de forma justa o que cada ferramenta consegue (ou não) analisar.

| Stack | Formas de estilização |
|---|---|
| HTML + JavaScript puro | CSS, CSS inline, Tailwind (CDN) |
| React + Vite | CSS, SCSS, CSS inline, Tailwind, Bootstrap |
| Angular | SCSS, CSS inline |

Esses projetos-base ficam no repositório de experimentos [tcc-labs](https://github.com/laiscoutinho/tcc-labs).

---

## 📚 Trabalhos relacionados

Antes de construir o TokenTidy, ferramentas existentes foram estudadas e testadas na prática no [tcc-labs](https://github.com/laiscoutinho/tcc-labs). Cada uma resolve parte do problema:

| Ferramenta | Foco | Pontos fortes | Limitações observadas / documentadas |
|---|---|---|---|
| [**@lapidist/design-lint**](https://github.com/bylapidist/design-lint) | Linter de design system | Valida uso de tokens em JS, TS, CSS, SCSS e Less; formato de tokens DTIF; `--fix`; integração com CI, LSP e MCP | Precisa que os tokens já existam; não analisa expressões dinâmicas em estilo inline; `.sass` indentado gera `parse-error`; kernel em segundo plano exige cuidado ao trocar de projeto |
| [**Design Token Extractor & Migrator**](https://github.com/bobrowsse-tech/design-token-extractor) | Extração e migração de tokens | Varre CSS, SCSS, Less, Vue, HTML e JS/TS (inclusive valores arbitrários do Tailwind); agrupa valores parecidos; gera DTCG/Tokens Studio; migração com pré-visualização e desfazer | Foco em extensão do VS Code; a verificação contínua é mais simples (`check` contra o lockfile) |
| [**stylelint-declaration-strict-value**](https://github.com/AndyOGo/stylelint-declaration-strict-value) | Regra do Stylelint | Obriga o uso de variáveis em propriedades escolhidas | Só analisa folhas de estilo; não sabe quais tokens existem nem sugere substituições |

O TokenTidy se apoia nessas lições: combinar a **extração/migração** do Design Token Extractor com a **verificação contínua** do design-lint, e investigar como cobrir melhor os casos que ficaram de fora.

---

## 🔬 Metodologia

1. **Revisão bibliográfica** sobre design systems, design tokens e padrões de formato (DTCG, DTIF)
2. **Experimentação** com ferramentas existentes no [tcc-labs](https://github.com/laiscoutinho/tcc-labs), seguindo o fluxo: escolher, configurar, rodar em cada projeto-base, registrar resultados (inclusive o que falhou) e concluir
3. **Levantamento de lacunas**: o que nenhuma ferramenta cobre bem (ex.: CSS inline, Tailwind, Bootstrap, Angular)
4. **Desenvolvimento** do TokenTidy com foco nessas lacunas
5. **Avaliação** do TokenTidy nos mesmos projetos-base, comparando com as ferramentas estudadas por critérios como:
   - Formas de estilização detectadas
   - Quantidade de valores soltos encontrados (e falsos positivos/negativos)
   - Qualidade das sugestões de tokens e das migrações automáticas
   - Facilidade de instalação, configuração e uso

---

## 🗺️ Roadmap

**Legenda:** ⚪ Planejado · 🟡 Em andamento · 🟢 Concluído

| Etapa | Status |
|---|---|
| Estudo de ferramentas existentes (design-lint, Design Token Extractor) | 🟡 |
| Definição do escopo e da arquitetura do TokenTidy | ⚪ |
| Detecção de valores soltos em CSS e SCSS | ⚪ |
| Detecção em CSS inline (HTML e JSX) | ⚪ |
| Detecção em classes utilitárias (Tailwind, Bootstrap) | ⚪ |
| Agrupamento de valores parecidos e sugestão de nomes | ⚪ |
| Geração de tokens (CSS, SCSS, DTCG) | ⚪ |
| Migração com pré-visualização | ⚪ |
| Modo linter / verificação no CI | ⚪ |
| Avaliação comparativa nos projetos-base | ⚪ |
| Escrita do texto do TCC | ⚪ |

---

## 📁 Estrutura do repositório

_A ser definida quando o desenvolvimento começar._

---

## 🔗 Relação com o TCC

- **Tema:** ferramenta para detecção, extração e verificação do uso de design tokens em projetos de front-end
- **Autoria:** Laís Coutinho
- **Curso / Instituição:** _preencher_
- **Orientador(a):** _preencher_
- **Laboratório de experimentos:** [tcc-labs](https://github.com/laiscoutinho/tcc-labs)

---

## 📄 Licença

_Defina a licença (ex.: MIT) ou indique que o conteúdo é de uso acadêmico._

---

<sub>Feito com curiosidade e muito café ☕</sub>
